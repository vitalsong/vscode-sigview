import * as vscode from 'vscode';
import { MemViewPanel, MemViewTracker, MemArrayParam, PlotType, SpectrumParam, SignalParam } from './panel';
import { DebugProtocol } from 'vscode-debugprotocol';
import { calcSpectrum, getFreqArray } from './utils';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "sigview" is now active!');

	context.subscriptions.push(vscode.commands.registerCommand('sigview.showPanel', () => {
		MemViewPanel.createOrShow(context);
		if (MemViewPanel.currentPanel) {
			TestDebugAdapter.currentAdapter = new TestDebugAdapter(MemViewPanel.currentPanel);
		}

		// context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory('*', {
		// 	createDebugAdapterTracker(session: vscode.DebugSession) {
		// 		if (MemViewPanel.currentPanel) {
		// 			return new TestDebugAdapter(MemViewPanel.currentPanel);
		// 		}
		// 	}
		// }));
	}));
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('SigView deactivated');
}

async function readMemory(session: vscode.DebugSession, address: string, size: number): Promise<Float32Array> {
	const resp = await session.customRequest('readMemory', { memoryReference: address, count: size });
	const base64Str = resp['data'];
	const u8arr = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
	const buf = new ArrayBuffer(u8arr.length);
	const u8view = new DataView(buf);
	for (let i = 0; i < u8arr.length; i++) {
		u8view.setUint8(i, u8arr[i]);
	}
	const arr = new Float32Array(buf);
	return arr;
}

async function getDebugArray(prm: MemArrayParam) {
	const session = vscode.debug.activeDebugSession;
	if (session) {
		//TODO: select true thread/stack
		const threads = await session.customRequest('threads');
		const threadId = threads.threads[0]['id'];

		const stacks = await session.customRequest('stackTrace', { threadId: threadId });
		const stackId = stacks.stackFrames[0].id;

		const scopes = await session.customRequest('scopes', { frameId: stackId });
		const localVarsRef = scopes.scopes[0].variablesReference;

		//find variable
		let variables = await session.customRequest('variables', { variablesReference: localVarsRef });
		let localVar = undefined;
		while ((localVar === undefined) || (localVar.evaluateName !== prm.arrName)) {
			localVar = variables.variables.filter((v: { evaluateName: string; }) => {
				return prm.arrName.includes(v.evaluateName);
			})[0];
			variables = await session.customRequest('variables', { variablesReference: localVar.variablesReference });
		}

		//if pointer type
		//TODO: use gdb/lldb customRequest
		let sigArray = undefined;
		if (localVar["type"].includes("*")) {
			const numBytes = prm.arrLength * 4;
			const address = variables.variables[0].memoryReference;
			sigArray = await readMemory(session, address, numBytes);
			//TODO: buffer to array cast functions
		} else {
			const resp = await session.customRequest('variables', { variablesReference: localVar.variablesReference });
			sigArray = Float32Array.from(resp.variables.slice(0, prm.arrLength), (x: any) => x.value);
		}

		return sigArray;
	}
}

function isEvent(message: DebugProtocol.ProtocolMessage): message is DebugProtocol.Event {
	return message.type === "event";
}

function isSpectrumParam(param: SpectrumParam | SignalParam): param is SpectrumParam {
	return param.type === PlotType.spectrum;
}

function isSignalParam(param: SpectrumParam | SignalParam): param is SignalParam {
	return param.type === PlotType.signal;
}

class TestDebugAdapter implements vscode.DebugAdapterTracker, MemViewTracker {

	private _panel: MemViewPanel;
	public static currentAdapter: TestDebugAdapter | undefined;

	public constructor(panel: MemViewPanel) {
		this._panel = panel;
		this._panel.setTracker(this);
	}

	async updateView() {
		try {
			const viewParam = this._panel.getPageParam();
			const sigArray = await getDebugArray(viewParam);
			if (sigArray === undefined) {
				return;
			}

			//TODO: cache result if signal not changed
			const pageParam = this._panel.getPageParam();
			const plotParam = pageParam.plotParam;
			if (isSignalParam(plotParam)) {
				const times = Float32Array.from(Array(sigArray.length).keys());
				await this._panel.plotSignal(sigArray, times);
			}

			if (isSpectrumParam(plotParam)) {
				const spec = calcSpectrum(sigArray, plotParam.ampScale, plotParam.windowType, plotParam.fullScale);
				const freqs = getFreqArray(spec.length, plotParam.sampleRate);
				await this._panel.plotSpectrum(spec, freqs);
			}

		} catch (error) {
			console.log(`Update MemViewPanel error: ${error}`);
		}
	}

	async onDidSendMessage(message: DebugProtocol.ProtocolMessage) {
		// console.log(message);
		if (isEvent(message)) {
			if (message.event === "stopped" && message.body) {
				//update for each debugger step
				await this.updateView();
			}
		}
	}

	async onReplotSignal() {
		await this.updateView();
	}
}