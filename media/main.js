function changedParam(vscode) {
    //reset error message text
    setErrorMessage("");

    const signalType = document.getElementById("signalType").value;
    let plotParam = undefined;
    let plotType = document.getElementById('plotType').value;
    if (plotType === 'spectrum') {
        plotParam = {
            windowType: document.getElementById("specWinType").value,
            fullScale: document.getElementById("specFullScale").value,
            sampleRate: document.getElementById("specSampleRate").value,
            ampScale: document.getElementById("specAmpUnits").value,
        };
    } else {
        plotParam = {
            complexMode: document.getElementById("complexMode").value
        };
    }

    let memParam = undefined;
    if (document.getElementById('dataTypeBlock').style.display === 'block') {
        memParam = {
            dataType: document.getElementById('dataType').value,
            dataEndian: document.getElementById('dataEndian').value,
        };
    }

    vscode.postMessage({
        command: 'changedParam',
        arrayName: document.getElementById("arrayName").value,
        arrayLength: document.getElementById("arrayLength").value,
        memParam: memParam,
        signalType: signalType,
        plotType: plotType,
        plotParam: plotParam,
    });
}

function updateSignalTypeView() {
    if (document.getElementById('signalType').value === "real") {
        document.getElementById('complexModeBlock').style.display = 'none';
    } else {
        document.getElementById('complexModeBlock').style.display = 'block';
    }
}

function updatePlotType() {
    document.getElementById('sigTab').className = 'tabcontent';
    document.getElementById('specTab').className = 'tabcontent';
    if (document.getElementById('plotType').value === 'signal') {
        document.getElementById('sigTab').className = '';
    } else if (document.getElementById('plotType').value === 'spectrum') {
        document.getElementById('specTab').className = '';
    }
}


function updateMemoryMode(param) {
    if (param.enabled && param.type && param.endian) {
        document.getElementById('dataTypeBlock').style.display = 'block';
        document.getElementById('dataEndianBlock').style.display = 'block';
        document.getElementById('dataType').value = param.type;
        document.getElementById('dataEndian').value = param.endian;
    } else {
        document.getElementById('dataTypeBlock').style.display = 'none';
        document.getElementById('dataEndianBlock').style.display = 'none';
    }
}

function setErrorMessage(message) {
    document.getElementById("errorMessage").textContent = message;
    document.getElementById("errorMessage").style.color = "red";
}

function replot(plotElem, plotData) {
    const margin = { l: 30, r: 20, t: 20, b: 20 };
    let data = [];
    for (let i = 0; i < plotData.length; ++i) {
        const trace = {
            x: plotData[i].xScale,
            y: plotData[i].yScale,
            type: 'scatter'
        };
        data.push(trace);
    }
    Plotly.newPlot(plotElem, data, {
        margin: margin,
        showlegend: false,
    });
}

function main() {

    const vscode = acquireVsCodeApi();

    //array param changed
    document.getElementById("arrayName").addEventListener("change", () => changedParam(vscode));
    document.getElementById("arrayLength").addEventListener("change", () => changedParam(vscode));
    document.getElementById("dataType").addEventListener("change", () => changedParam(vscode));
    document.getElementById("dataEndian").addEventListener("change", () => changedParam(vscode));
    document.getElementById("signalType").addEventListener("change", () => changedParam(vscode));
    document.getElementById("plotType").addEventListener("change", () => changedParam(vscode));
    document.getElementById("complexMode").addEventListener("change", () => changedParam(vscode));

    //update ui
    document.getElementById("signalType").addEventListener("change", () => updateSignalTypeView());
    document.getElementById("plotType").addEventListener("change", () => updatePlotType());

    //changed spectrum param
    document.getElementById("specWinType").addEventListener("change", () => changedParam(vscode));
    document.getElementById("specFullScale").addEventListener("change", () => changedParam(vscode));
    document.getElementById("specAmpUnits").addEventListener("change", () => changedParam(vscode));
    document.getElementById("specSampleRate").addEventListener("change", () => changedParam(vscode));

    //update for default
    updatePlotType();
    updateSignalTypeView();

    updateMemoryMode({ enabled: false });

    window.addEventListener('message', event => {
        const message = event.data;
        const plot = document.getElementById('sigPlot');
        switch (message.command) {
            case 'updatePlot':
                {
                    replot(plot, message.plotData);
                    break;
                }

            case 'setMemoryMode':
                {
                    updateMemoryMode(message);
                    break;
                }

            case 'setError':
                {
                    setErrorMessage(message.text);
                    break;
                }
        }
    });
}

main();