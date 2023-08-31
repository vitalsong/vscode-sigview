import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WindowType, SpectrumFormat } from './utils';
import { DataType, Endian } from './memory';

export interface MemViewTracker {
    onReplotSignal?(): void;
}

export enum PlotType {
    signal = "signal",
    spectrum = "spectrum"
}

export class SpectrumParam {
    type: PlotType = PlotType.spectrum;
    sampleRate: number = 1.0;
    fullScale: number = 1.0;
    windowType: WindowType = WindowType.hann;
    ampScale: SpectrumFormat = SpectrumFormat.db;
}

export class SignalParam {
    type: PlotType = PlotType.signal;
    //...
}

export class MemArrayParam {
    arrName: string = "";
    arrLength: number = 0;
    plotParam: SpectrumParam | SignalParam = new SignalParam();
    dataType: DataType | undefined;
    dataEndian: Endian | undefined;
};


//TODO: hide 'type' section if variable is not address, like 0xffffffff
export class MemViewPanel {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: MemViewPanel | undefined;
    public static readonly viewType = 'sigView';
    private readonly _panel: vscode.WebviewPanel;
    private _pageParam: MemArrayParam = new MemArrayParam();
    private _disposables: vscode.Disposable[] = [];
    private _tracker: MemViewTracker | undefined = undefined;
    private _context: vscode.ExtensionContext;

    public static createOrShow(context: vscode.ExtensionContext) {
        // If we already have a panel, show it.
        if (MemViewPanel.currentPanel) {
            MemViewPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        const options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        };

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            MemViewPanel.viewType,
            'Signal View',
            vscode.ViewColumn.Beside,
            options
        );

        MemViewPanel.currentPanel = new MemViewPanel(panel, context);
    }

    public static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        MemViewPanel.currentPanel = new MemViewPanel(panel, context);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._context = context;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            () => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'changedParam': {
                        const plotType = String(message.plotType).toLowerCase() as PlotType;
                        let param = new SignalParam();
                        if (plotType === PlotType.spectrum) {
                            let specParam = new SpectrumParam();
                            specParam.fullScale = Number(message.specParam.fullScale);
                            specParam.sampleRate = Number(message.specParam.sampleRate);
                            specParam.windowType = String(message.specParam.windowType).toLowerCase() as WindowType;
                            specParam.ampScale = String(message.specParam.ampScale).toLowerCase() as SpectrumFormat;
                            param = specParam;
                        }

                        this._pageParam =
                        {
                            arrName: message.arrayName,
                            arrLength: Number(message.arrayLength),
                            plotParam: param,
                            dataType: message.memParam?.dataType as DataType,
                            dataEndian: message.memParam?.dataEndian as Endian,
                        };
                        this._tracker?.onReplotSignal?.();
                        return;
                    }
                }
            },
            null,
            this._disposables
        );
    }

    public getPageParam(): MemArrayParam {
        return this._pageParam;
    }

    public setTracker(tracker: MemViewTracker) {
        this._tracker = tracker;
    }

    public dispose() {
        MemViewPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    async plotSignal(yScale: Float64Array, xScale: Float64Array) {
        await this._panel.webview.postMessage({ command: 'scatterPlot', yScale: yScale, xScale: xScale });
    }

    async plotSpectrum(yScale: Float64Array, xScale: Float64Array) {
        await this._panel.webview.postMessage({ command: 'spectrumPlot', yScale: yScale, xScale: xScale });
    }

    async setMemoryMode(enabled: boolean = true, type: DataType | undefined = undefined, endian: Endian | undefined = undefined) {
        await this._panel.webview.postMessage({ command: 'setMemoryMode', enabled: enabled, type: type, endian: endian });
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.js'));
        const stylesResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'reset.css'));
        const stylesMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'vscode.css'));
        const plotlyUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'plotly-latest.min.js'));
        const filePath: vscode.Uri = vscode.Uri.file(path.join(this._context.extensionPath, 'media', 'index.html'));
        const mainDiv = fs.readFileSync(filePath.fsPath, 'utf8');

        return `<!DOCTYPE html>
        <html lang="en">
        
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${stylesResetUri}" rel="stylesheet">
            <link href="${stylesMainUri}" rel="stylesheet">
            <title>Mem view</title>
        </head>
        
        <body>

        ${mainDiv}

        <script src="${plotlyUri}"></script>
        <script src="${scriptUri}"></script>

        </body>
        
        </html>`;
    }
}
