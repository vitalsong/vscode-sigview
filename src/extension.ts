import * as vscode from 'vscode';
import { MemViewPanel, MemViewTracker, MemArrayParam, PlotType, SpectrumParam, SignalParam } from './panel';
import { DebugProtocol } from '@vscode/debugprotocol';
import { calcSpectrum, getFreqArray } from './utils';
import { DataType, Endian, extractArray, memorySize } from './memory';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	TestDebugAdapter.currentAdapter = new TestDebugAdapter();

	context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory('*', {
		createDebugAdapterTracker(session: vscode.DebugSession) {
			return TestDebugAdapter.currentAdapter;
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('sigview.showPanel', () => {
		MemViewPanel.createOrShow(context);
		if (MemViewPanel.currentPanel) {
			TestDebugAdapter.currentAdapter?.setViewPanel(MemViewPanel.currentPanel);
		}
	}));
}

// This method is called when your extension is deactivated
export function deactivate() {
	TestDebugAdapter.currentAdapter = undefined;
	console.debug('SigView deactivated');
}

async function pointerAddress(session: vscode.DebugSession, variable: DebugProtocol.Variable) {
	let variables = await session.customRequest('variables', { variablesReference: variable.variablesReference });
	return variables.variables[0].memoryReference;
}

function isPointerVariable(variable: DebugProtocol.Variable): boolean {
	//TODO: check 'variables' children count
	//TODO: check language (c++/c/rust?)
	if (!variable.type) {
		return false;
	}
	return variable.type.includes("*");
}

const int8Re = new RegExp('int8|char');
const uint8Re = new RegExp('uint8|unsigned char');
const int16Re = new RegExp('int16|short');
const uint16Re = new RegExp('uint16|unsigned short');
const int32Re = new RegExp('int32|int');
const uint32Re = new RegExp('uint32|unsigned int');
const float32Re = new RegExp('float');
const float64Re = new RegExp('double');

function pointerType(variable: DebugProtocol.Variable): DataType | undefined {
	if (!variable.type) {
		return undefined;
	}

	const type = variable.type;
	if (float32Re.test(type)) {
		return DataType.float32;
	}
	if (float64Re.test(type)) {
		return DataType.float64;
	}
	if (int8Re.test(type)) {
		return DataType.int8;
	}
	if (uint8Re.test(type)) {
		return DataType.uint8;
	}
	if (int16Re.test(type)) {
		return DataType.int16;
	}
	if (uint16Re.test(type)) {
		return DataType.uint16;
	}
	if (int32Re.test(type)) {
		return DataType.int32;
	}
	if (uint32Re.test(type)) {
		return DataType.uint32;
	}
}

async function readFromMemory(session: vscode.DebugSession, address: string, type: DataType, count: number, endian: Endian = Endian.little): Promise<Float64Array> {
	const numBytes = memorySize(count, type);
	const resp = await session.customRequest('readMemory', { memoryReference: address, count: numBytes });
	const base64Str = resp['data'];
	const u8arr = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
	const array = extractArray(u8arr, type, endian);
	return array;
}

async function readFromScope(session: vscode.DebugSession, varRef: number, start: number, count: number): Promise<Float64Array | undefined> {
	const args = {
		variablesReference: varRef,
		// TODO: check supportsVariablePaging
		// filter: 'indexed',
		// start: start,
		// count: count
	};

	const resp = await session.customRequest('variables', args);

	//filter '[index]' elements
	let variables = resp.variables.filter((v: { name: string; }) => {
		const value = Number(v.name.slice(1, -1));
		return !Number.isNaN(value);
	});

	if (variables.length < (start + count)) {
		return undefined;
	}

	variables = variables.slice(start, start + count);
	const array = Float64Array.from(variables, (x: any) => x.value);
	return array;
}

function filterVariable(variables: any, name: string): DebugProtocol.Variable | undefined {
	const filtered = variables.filter((v: { name: string; }) => {
		return v.name === name;
	});
	if (filtered.length === 1) {
		return filtered[0];
	}
}

async function findVariable(session: vscode.DebugSession, name: string): Promise<DebugProtocol.Variable | undefined> {
	if (!session) {
		return;
	}

	//TODO: select true thread/stack
	//TODO: don't request session and variables every time
	const threads = await session.customRequest('threads');
	const threadId = threads.threads[0]['id'];

	const stacks = await session.customRequest('stackTrace', { threadId: threadId });
	const stackId = stacks.stackFrames[0].id;

	const scopes = await session.customRequest('scopes', { frameId: stackId });
	const localVarsRef = scopes.scopes[0].variablesReference;

	let variables = await session.customRequest('variables', { variablesReference: localVarsRef });

	//find unique variable name in scope
	let localVar = filterVariable(variables.variables, name);
	if (localVar) {
		return localVar;
	}

	const varpath = name.split(".");
	for (let i = 0; i < varpath.length; ++i) {
		const path = varpath[i];
		localVar = filterVariable(variables.variables, path);
		if (!localVar) {
			return undefined;
		}
		variables = await session.customRequest('variables', { variablesReference: localVar.variablesReference });
	}

	return localVar;
}

async function getArray(session: vscode.DebugSession, param: MemArrayParam): Promise<DebugArray | undefined> {
	let variable = await findVariable(session, param.arrName);
	if (!variable) {
		console.debug('variable is not exist');
		return;
	}

	const arrLength = param.arrLength;
	if (!isPointerVariable(variable)) {
		const sigArray = await readFromScope(session, variable.variablesReference, 0, arrLength);
		return { array: sigArray, type: undefined, endian: undefined };
	}

	//TODO: use gdb/lldb customRequest
	const address = await pointerAddress(session, variable);

	//update data type
	let dataType = param.dataType;
	dataType ??= pointerType(variable);
	dataType ??= DataType.int8;

	//update endian
	//TODO: get info from system
	let dataEndian = param.dataEndian;
	dataEndian ??= Endian.little;

	const sigArray = await readFromMemory(session, address, dataType, arrLength, dataEndian);
	return { array: sigArray, type: dataType, endian: dataEndian };
}

function isEvent(message: DebugProtocol.ProtocolMessage): message is DebugProtocol.Event {
	return message.type === "event";
}

function isResponse(message: DebugProtocol.ProtocolMessage): message is DebugProtocol.Response {
	return message.type === "response";
}

function isSpectrumParam(param: SpectrumParam | SignalParam): param is SpectrumParam {
	return param.type === PlotType.spectrum;
}

function isSignalParam(param: SpectrumParam | SignalParam): param is SignalParam {
	return param.type === PlotType.signal;
}

class DebugArray {
	array: Float64Array | undefined;
	type: DataType | undefined;
	endian: Endian | undefined;
}

class TestDebugAdapter implements vscode.DebugAdapterTracker, MemViewTracker {

	private _panel: MemViewPanel | undefined;
	private _initParam: any | undefined;
	private _prevArray: string | undefined;

	public static currentAdapter: TestDebugAdapter | undefined;

	public setViewPanel(panel: MemViewPanel) {
		this._panel = panel;
		this._panel.setTracker(this);
	}

	private checkMemoryMode(debugArray: DebugArray) {
		if (!this._panel) {
			return;
		}

		if (!debugArray.type) {
			this._panel.setMemoryMode(false);
		} else {
			const oldParam = this._panel.getPageParam();
			if (!oldParam.dataType) {
				this._panel.setMemoryMode(true, debugArray.type, debugArray.endian);
			}
		}
	}

	async updateView() {

		if (!this._panel) {
			console.debug('view panel is not visible');
			return;
		}

		const session = vscode.debug.activeDebugSession;
		if (!session) {
			console.debug('debug session is not active');
			return;
		}

		try {
			let pageParam = this._panel.getPageParam();
			let sigArray = new Float64Array(0);

			//reset param if array changed
			//this is needed to ignore values ​​from the GUI
			if (this._prevArray !== pageParam.arrName) {
				pageParam.dataType = undefined;
				pageParam.dataEndian = undefined;
				this._prevArray = pageParam.arrName;
			}

			let debugArray = await getArray(session, pageParam);
			if (debugArray) {
				this.checkMemoryMode(debugArray);
				if (debugArray.array) {
					sigArray = debugArray.array;
				}
			}

			//TODO: cache result if signal not changed
			const plotParam = pageParam.plotParam;
			if (isSignalParam(plotParam)) {
				const times = Float64Array.from(Array(sigArray.length).keys());
				await this._panel.plotSignal(sigArray, times);
			}

			if (isSpectrumParam(plotParam)) {
				const spec = calcSpectrum(sigArray, plotParam.ampScale, plotParam.windowType, plotParam.fullScale);
				const freqs = getFreqArray(spec.length, plotParam.sampleRate);
				await this._panel.plotSpectrum(spec, freqs);
			}

		} catch (error) {
			console.debug(`Update SigViewPanel error: ${error}`);
		}
	}

	async onDidSendMessage(message: DebugProtocol.ProtocolMessage) {

		if (isResponse(message)) {
			if (message.command === "initialize" && message.body) {
				//init param from adapter
				this._initParam = message.body;
			}
		}

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