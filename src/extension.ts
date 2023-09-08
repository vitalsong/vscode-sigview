import * as vscode from 'vscode';
import { MemViewPanel, MemViewTracker, MemArrayParam, PlotType, SpectrumParam, SignalParam, SignalType, ExtPlotType, PlotData } from './panel';
import { DebugProtocol } from '@vscode/debugprotocol';
import { calcSpectrum, RealArray, ComplexArray } from './utils';
import { DataType, Endian, memorySize, MemoryBlock } from './memory';

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

function filterVariable(variables: any, name: string): DebugProtocol.Variable | undefined {
	const filtered = variables.filter((v: { name: string; }) => {
		return v.name.trim() === name;
	});
	if (filtered.length === 1) {
		return filtered[0];
	}
}

function isMemoryAddress(value: string) {
	const addresRe = new RegExp('0x[0-9A-F]{4,}');
	return addresRe.test(value);
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

	let resvar = undefined;
	const varpath = name.split(".");
	for (let i = 0; i < varpath.length; ++i) {
		const path = varpath[i];
		resvar = filterVariable(variables.variables, path);
		if (!resvar) {
			return undefined;
		}
		if (i !== varpath.length - 1) {
			//ignore last variables
			variables = await session.customRequest('variables', { variablesReference: resvar.variablesReference });
		}
	}

	return resvar;
}

class ScopeArray {
	name: string;
	array: Float64Array;

	constructor(name: string, array: Float64Array) {
		this.name = name;
		this.array = array;
	}
};

class MemoryArray {
	name: string;
	array: Float64Array;
	type: DataType;
	endian: Endian;

	constructor(name: string, array: Float64Array, type: DataType, endian: Endian) {
		this.name = name;
		this.array = array;
		this.type = type;
		this.endian = endian;
	}
};

type DebugArray = ScopeArray | MemoryArray;

const indexNameRe = new RegExp('[[0-9]+]');

const subArrRe = new RegExp('\[0:[0-9]+\]');

//check if variable has `[0:N]` subelement
async function tryGetSubarrayVariable(session: vscode.DebugSession, variable: DebugProtocol.Variable): Promise<DebugProtocol.Variable | undefined> {
	let resp = await session.customRequest('variables', { variablesReference: variable.variablesReference });
	const filtered = resp.variables.filter((v: { name: string; }) => {
		return subArrRe.test(v.name);
	});

	if (filtered.length === 1) {
		return filtered[0];
	}
}

async function getScopeArray(session: vscode.DebugSession, name: string, isComplex: boolean = false): Promise<Float64Array | undefined> {
	let variable = await findVariable(session, name);
	if (!variable) {
		console.debug('variable is not exist');
		return;
	}

	const subbarray = await tryGetSubarrayVariable(session, variable);
	if (subbarray) {
		variable = subbarray;
	}

	// TODO: check supportsVariablePaging
	const resp = await session.customRequest('variables', { variablesReference: variable.variablesReference });

	//filter '[00]', '11' elements
	let variables = resp.variables.filter((v: { name: string; }) => {
		const isOperator = indexNameRe.test(v.name);
		const isNumber = !Number.isNaN(Number(v.name));
		return isOperator || isNumber;
	});

	//TODO: try extract complex signal (like [0]["re"], [0]["im"]...)

	const array = Float64Array.from(variables, (x: any) => x.value);
	return array;
}

async function getMemoryBlock(session: vscode.DebugSession, address: string, numBytes: number): Promise<MemoryBlock | undefined> {
	const resp = await session.customRequest('readMemory', { memoryReference: address, count: numBytes });
	const base64Str = resp['data'];
	const u8arr = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
	let result = new MemoryBlock(Number(address), u8arr);
	return result;
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

type ScopeArrayCache = {
	[name: string]: Float64Array;
};

class TestDebugAdapter implements vscode.DebugAdapterTracker, MemViewTracker {

	private _panel: MemViewPanel | undefined;
	private _initParam: any | undefined;
	private _prevArray: string | undefined;
	private _arrayCache: ScopeArrayCache = {};
	public static currentAdapter: TestDebugAdapter | undefined;

	public setViewPanel(panel: MemViewPanel) {
		this._panel = panel;
		this._panel.setTracker(this);
	}

	private checkMemoryMode(debugArray: DebugArray) {
		if (!this._panel) {
			return;
		}

		if (debugArray instanceof MemoryArray) {
			const currentParam = this._panel.getPageParam();
			if (!currentParam.dataType) {
				this._panel.setMemoryMode(true, debugArray.type, debugArray.endian);
			}
		} else {
			this._panel.setMemoryMode(false);
		}
	}

	private async getMemoryArray(session: vscode.DebugSession, address: string, length: number, dataType: DataType, dataEndian: Endian): Promise<MemoryArray | undefined> {
		const numBytes = memorySize(length, dataType);
		const memBlock = await getMemoryBlock(session, address, numBytes);
		if (!memBlock) {
			return;
		}
		const array = memBlock.toArray(dataType, dataEndian);
		return new MemoryArray(address, array, dataType, dataEndian);
	}

	private async getDebugArray(session: vscode.DebugSession, pageParam: Readonly<MemArrayParam>, isComplex: boolean = false): Promise<DebugArray | undefined> {
		let length = pageParam.arrLength;

		//TODO: find re/im or [0]/[1] sub-elements
		if (isComplex) {
			length *= 2;
		}

		if (isMemoryAddress(pageParam.arrName)) {
			let dataType = pageParam.dataType;
			let dataEndian = pageParam.dataEndian;
			dataType ??= DataType.uint8;
			dataEndian ??= Endian.little;
			const array = await this.getMemoryArray(session, pageParam.arrName, length, dataType, dataEndian);
			return array;
		}

		let variable = await findVariable(session, pageParam.arrName);
		if (!variable) {
			throw new Error(`could not find variable ${pageParam.arrName}`);
		}

		if (isPointerVariable(variable)) {
			let dataType = pageParam.dataType;
			let dataEndian = pageParam.dataEndian;
			dataType ??= pointerType(variable);
			dataType ??= DataType.uint8;
			dataEndian ??= Endian.little;
			const address = await pointerAddress(session, variable);
			if (!address) {
				throw new Error(`error getting address by pointer`);
			}
			const array = await this.getMemoryArray(session, address, length, dataType, dataEndian);
			return array;
		} else {
			if (!(pageParam.arrName in this._arrayCache)) {
				const array = await getScopeArray(session, pageParam.arrName);
				if (!array) {
					throw new Error(`failed to load scope variable ${pageParam.arrName}`);
				}
				this._arrayCache[pageParam.arrName] = array;
			}
			const array = this._arrayCache[pageParam.arrName];
			length = (length === 0) ? array.length : length;
			length = (length > array.length) ? array.length : length;
			return new ScopeArray(pageParam.arrName, array.slice(0, length));
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
			//reset param if array changed
			//this is needed to ignore values ​​from the GUI
			let pageParam = new MemArrayParam();
			pageParam = this._panel.getPageParam();
			if (this._prevArray !== pageParam.arrName) {
				pageParam.dataType = undefined;
				pageParam.dataEndian = undefined;
				this._prevArray = pageParam.arrName;
			}

			const isComplex = (pageParam.signalType === SignalType.complex);
			let debugArray = await this.getDebugArray(session, pageParam, isComplex);
			if (!debugArray) {
				debugArray = new ScopeArray(pageParam.arrName, new Float64Array(0));
			}

			this.checkMemoryMode(debugArray);

			let signal: RealArray | ComplexArray | undefined = undefined;
			if (isComplex) {
				signal = new ComplexArray(debugArray.array);
			} else {
				signal = new RealArray(debugArray.array);
			}

			//update if length empty or not supported
			if (pageParam.arrLength !== signal.size()) {
				await this._panel.updateArrayLength(signal.size());
			}

			let plotData = new Array<PlotData>;
			const plotParam = pageParam.plotParam;
			if (plotParam instanceof SignalParam) {
				if (signal instanceof RealArray) {
					const xScale = Float64Array.from(Array(signal.size()).keys());
					plotData = [new PlotData(xScale, signal.array)];
				} else if (signal instanceof ComplexArray) {
					const xScale = Float64Array.from(Array(signal.size()).keys());
					switch (plotParam.ext) {
						case ExtPlotType.real:
							plotData = [new PlotData(xScale, signal.real())];
							break;

						case ExtPlotType.imag:
							plotData = [new PlotData(xScale, signal.imag())];
							break;

						case ExtPlotType.abs:
							plotData = [new PlotData(xScale, signal.abs())];
							break;


						case ExtPlotType.phase:
							plotData = [new PlotData(xScale, signal.phase())];
							break;

						case ExtPlotType.reim:
							const real = new PlotData(xScale, signal.real(), "re");
							const imag = new PlotData(xScale, signal.imag(), "im");
							plotData = [real, imag];
							break;
					}
				}
			} else if (plotParam instanceof SpectrumParam) {
				if (signal instanceof RealArray) {
					const res = calcSpectrum(signal, plotParam.ampScale, plotParam.windowType, plotParam.fullScale);
					plotData = [new PlotData(res.freqs.map(x => x * plotParam.sampleRate), res.amps)];
				} else if (signal instanceof ComplexArray) {
					const res = calcSpectrum(signal, plotParam.ampScale, plotParam.windowType, plotParam.fullScale);
					plotData = [new PlotData(res.freqs.map(x => x * plotParam.sampleRate), res.amps)];
				}
			}

			await this._panel.updatePlot(plotData);

		} catch (error) {
			if (this._panel) {
				this._panel.setErrorMessage(String(error));
			}
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
				//reset the cache, because there is no guarantee that the data is not named
				this.clearCache();

				//update for each debugger step
				await this.updateView();
			}
		}
	}

	public clearCache() {
		this._arrayCache = {};
	}

	async onReplotSignal() {
		await this.updateView();
	}
}