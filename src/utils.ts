const ML_FFT = require("ml-fft");

export enum SpectrumFormat {
    mag = "mag",
    pow = "pow",
    db = "db"
}

export enum WindowType {
    rectangle = "rectangle",
    hamming = "hamming",
    hann = "hann",
    sinus = "sinus",
    blackman = "blackman",
}

function calcWindow(n: number, winType: WindowType = WindowType.hamming) {
    let win = new Float64Array(n);
    switch (winType) {
        case WindowType.rectangle: {
            for (let i = 0; i < n; i++) {
                win[i] = 1.0;
            }
            break;
        }

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

        case WindowType.blackman: {
            for (let i = 0; i < n; i++) {
                win[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
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

export class RealArray {
    constructor(array: Float64Array) {
        this.array = array;
    }
    public size() {
        return this.array.length;
    }
    array: Float64Array;
}

export class ComplexArray {
    constructor(array: Float64Array) {
        this.array = array;
    }
    public size() {
        return (this.array.length / 2);
    }

    public real(): Float64Array {
        let res = new Float64Array(this.size());
        for (let i = 0; i < res.length; ++i) {
            res[i] = this.array[2 * i];
        }
        return res;
    }

    public imag(): Float64Array {
        let res = new Float64Array(this.size());
        for (let i = 0; i < res.length; ++i) {
            res[i] = this.array[2 * i + 1];
        }
        return res;
    }

    public abs(): Float64Array {
        let res = new Float64Array(this.size());
        for (let i = 0; i < res.length; ++i) {
            const re = this.array[2 * i];
            const im = this.array[2 * i + 1];
            res[i] = Math.sqrt((re * re) + (im * im));
        }
        return res;
    }

    public phase(): Float64Array {
        //TODO: unwrap
        let res = new Float64Array(this.size());
        for (let i = 0; i < res.length; ++i) {
            const re = this.array[2 * i];
            const im = this.array[2 * i + 1];
            res[i] = Math.atan2(re, im);
        }
        return res;
    }

    array: Float64Array;
}

export class SpectrumResult {
    constructor(amps: Float64Array, freqs: Float64Array) {
        this.amps = amps;
        this.freqs = freqs;
    }
    amps: Float64Array;
    freqs: Float64Array;
}

//TODO: base type Float64
export function calcSpectrum(sig: Readonly<RealArray | ComplexArray>, specType: SpectrumFormat = SpectrumFormat.db, winType: WindowType = WindowType.hamming, fullScale: number = 1.0): SpectrumResult {
    let FFT = ML_FFT.FFT;
    const n = sig.size();
    const nfft = nextpow2size(n);
    const win = calcWindow(n, winType);

    FFT.init(nfft);

    let re = new Float64Array(nfft);
    let im = new Float64Array(nfft);
    let fftDiv: number = nfft;
    let specSize: number = nfft;
    if (sig instanceof RealArray) {
        re = sig.array;
        fftDiv = nfft / 2;
        specSize = nfft / 2 + 1;
    } else if (sig instanceof ComplexArray) {
        for (let i = 0; i < n; i++) {
            re[i] = sig.array[2 * i] * win[i];
            im[i] = sig.array[2 * i + 1] * win[i];
        }
    }

    FFT.fft(re, im);

    let spec = new Float64Array(specSize);
    for (let i = 0; i < spec.length; i++) {
        re[i] = re[i] / fftDiv;
        im[i] = im[i] / fftDiv;
        spec[i] = ((re[i] * re[i]) + (im[i] * im[i]));
    }

    switch (specType) {
        case SpectrumFormat.mag: {
            for (let i = 0; i < spec.length; i++) {
                spec[i] = Math.sqrt(spec[i]);
            }
            break;
        }

        case SpectrumFormat.db: {
            const scale = fullScale * fullScale;
            for (let i = 0; i < spec.length; i++) {
                spec[i] = 10 * Math.log10(spec[i] / scale);
            }
            break;
        }

        default:
            //nothing to do
            break;
    }

    let freqs = new Float64Array(specSize);
    const dfreq = (1.0 / nfft);
    if (sig instanceof RealArray) {
        for (let i = 0; i < freqs.length; i++) {
            freqs[i] = i * dfreq;
        }
    } else {
        let cspec = new Float64Array(nfft);
        for (let i = 0; i < nfft / 2; i++) {
            freqs[i] = (i - nfft / 2) * dfreq;
            cspec[i] = spec[nfft / 2 + i];
        }
        for (let i = nfft / 2; i < nfft; i++) {
            freqs[i] = (i - nfft / 2) * dfreq;
            cspec[i] = spec[i - nfft / 2];
        }
        spec = cspec;
    }

    return new SpectrumResult(spec, freqs);
}