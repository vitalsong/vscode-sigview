const ML_FFT = require("ml-fft");

export enum SpectrumFormat {
    mag = "mag",
    pow = "pow",
    db = "db"
}

export enum WindowType {
    hamming = "hamming",
    hann = "hann",
    sinus = "sinus"
}

export function getFreqArray(numFreqs: number, sampleRate: number = 1.0, halfSpec: boolean = true): Float32Array {
    let fftLen = numFreqs;
    if (halfSpec) {
        fftLen = nextpow2size((numFreqs - 1) * 2);
    }

    const dfreq = (sampleRate / fftLen);
    let freqs = new Float32Array(numFreqs);
    for (let i = 0; i < freqs.length; i++) {
        freqs[i] = i * dfreq;
    }
    return freqs;
}

function calcWindow(n: number, winType: WindowType = WindowType.hamming) {
    let win = new Float32Array(n);
    switch (winType) {
        case WindowType.hann: {
            for (let i = 0; i < n; i++) {
                win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
            }
            break;
        }
        case WindowType.hamming: {
            for (let i = 0; i < n; i++) {
                win[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
            }
            break;
        }

        case WindowType.sinus: {
            for (let i = 0; i < n; i++) {
                win[i] = Math.sin((Math.PI * i) / (n - 1));
            }
            break;
        }

    }
    return win;
}

function nextpow2(n: number) {
    if (n === 0 || n === 1) {
        return 0;
    }

    let p = 0;
    while ((n >> p) !== 0) {
        ++p;
    }

    if ((1 << (p - 1)) === n) {
        return (p - 1);
    }

    return p;
}

function nextpow2size(n: number) {
    const p = nextpow2(n);
    return Math.pow(2, p);
}

//TODO: base type Float64
export function calcSpectrum(sig: Float32Array, specType: SpectrumFormat = SpectrumFormat.db, winType: WindowType = WindowType.hamming, fullScale: number = 1.0): Float32Array {
    let FFT = ML_FFT.FFT;
    const n = sig.length;
    const nfft = nextpow2size(n);
    const win = calcWindow(n, winType);
    FFT.init(nfft);
    let re = new Float32Array(nfft);
    let im = new Float32Array(nfft);
    for (let i = 0; i < n; i++) {
        re[i] = sig[i] * win[i];
        im[i] = 0;
    }

    FFT.fft(re, im);

    let spec = new Float32Array(nfft / 2 + 1);
    for (let i = 0; i < spec.length; i++) {
        spec[i] = ((re[i] * re[i]) + (im[i] * im[i])) / nfft;
    }

    switch (specType) {
        case SpectrumFormat.mag: {
            for (let i = 0; i < spec.length; i++) {
                spec[i] = Math.sqrt(spec[i]);
            }
            break;
        }

        case SpectrumFormat.db: {
            for (let i = 0; i < spec.length; i++) {
                spec[i] = 10 * Math.log10(spec[i] / (fullScale * fullScale));
            }
            break;
        }

        default:
            //nothing to do
            break;
    }

    return spec;
}