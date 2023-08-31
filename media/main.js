function changedParam(vscode) {
    let specParam = {
        windowType: document.getElementById("specWinType").value,
        fullScale: document.getElementById("specFullScale").value,
        sampleRate: document.getElementById("specSampleRate").value,
        ampScale: document.getElementById("specAmpUnits").value,
    };

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
        plotType: document.getElementById("plotType").value,
        specParam: specParam,
        memParam: memParam,
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

function replot(plotElem, yScale, xScale) {
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
    document.getElementById("dataType").addEventListener("change", () => changedParam(vscode));
    document.getElementById("dataEndian").addEventListener("change", () => changedParam(vscode));

    document.getElementById("plotType").addEventListener("change", () => changedPlot(vscode));

    //changed spectrum param
    // document.getElementById("specTabLink").addEventListener("click", () => showSpectrumTab(vscode));
    document.getElementById("specWinType").addEventListener("change", () => changedParam(vscode));
    document.getElementById("specFullScale").addEventListener("change", () => changedParam(vscode));
    document.getElementById("specAmpUnits").addEventListener("change", () => changedParam(vscode));
    document.getElementById("specSampleRate").addEventListener("change", () => changedParam(vscode));

    //update for default
    changedPlot(vscode);
    updateMemoryMode({enabled: false});

    window.addEventListener('message', event => {
        const message = event.data;
        const plot = document.getElementById('sigPlot');
        switch (message.command) {
            case 'scatterPlot':
                {
                    replot(plot, message.yScale, message.xScale);
                    break;
                }

            case 'spectrumPlot':
                {
                    replot(plot, message.yScale, message.xScale);
                    break;
                }

            case 'setMemoryMode':
                {
                    updateMemoryMode(message);
                    break;
                }
        }
    });
}

main();