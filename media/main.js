function changedParam(vscode) {
    let specParam = {
        windowType: document.getElementById("specWinType").value,
        fullScale: document.getElementById("specFullScale").value,
        sampleRate: document.getElementById("specSampleRate").value,
        ampScale: document.getElementById("specAmpUnits").value,
    };
    vscode.postMessage({
        command: 'changedParam',
        arrayName: document.getElementById("arrayName").value,
        arrayLength: document.getElementById("arrayLength").value,
        plotType: document.getElementById("plotType").value,
        specParam: specParam,
    });
}

function changedPlot(vscode) {
    document.getElementById('sigTab').className = 'tabcontent';
    document.getElementById('specTab').className = 'tabcontent';
    if (document.getElementById('plotType').value === 'Signal') {
        document.getElementById('sigTab').className = '';
    } else if (document.getElementById('plotType').value === 'Spectrum') {
        document.getElementById('specTab').className = '';
    }
    changedParam(vscode);
}

function replot(plotElem, yScale, xScale)
{
    const margin = { l: 30, r: 20, t: 20, b: 20 };
    // var xScale = Array.from(Array(yScale.length).keys());
    let trace = {
        x: xScale,
        y: yScale,
        type: 'scatter'
    };
    let plotData = [trace];
    Plotly.newPlot(plotElem, plotData, {
        margin: margin
    });
}

function main() {

    const vscode = acquireVsCodeApi();

    //array param changed
    document.getElementById("arrayName").addEventListener("change", () => changedParam(vscode));
    document.getElementById("arrayLength").addEventListener("change", () => changedParam(vscode));
    document.getElementById("plotType").addEventListener("change", () => changedPlot(vscode));
    
    //changed spectrum param
    // document.getElementById("specTabLink").addEventListener("click", () => showSpectrumTab(vscode));
    document.getElementById("specWinType").addEventListener("change", () => changedParam(vscode));
    document.getElementById("specFullScale").addEventListener("change", () => changedParam(vscode));
    document.getElementById("specAmpUnits").addEventListener("change", () => changedParam(vscode));
    document.getElementById("specSampleRate").addEventListener("change", () => changedParam(vscode));

    //update for default
    changedPlot(vscode);

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'scatterPlot':
                {
                    //TODO: remove copypaste
                    let graphDiv = document.getElementById('sigPlot');
                    replot(graphDiv, message.yScale, message.xScale);
                    break;
                }

            case 'spectrumPlot':
                {
                    let graphDiv = document.getElementById('specPlot');
                    replot(graphDiv, message.yScale, message.xScale);
                    break;
                }
        }
    });
}

main();