
export enum DataType {
    float32 = "float32",
    float64 = "float64",
    int8 = "int8",
    uint8 = "uint8",
    int16 = "int16",
    uint16 = "uint16",
    int32 = "int32",
    uint32 = "uint32",
}

type TypeSizes = {
    [key in DataType]: number;
};

const TYPE_SIZE: TypeSizes = {
    float32: 4,
    float64: 8,
    int8: 1,
    uint8: 1,
    int16: 2,
    uint16: 2,
    int32: 4,
    uint32: 4,
};

export enum Endian {
    little = "little",
    big = "big"
}

type RawArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

function castBuffer(view: DataView, count: number, type: DataType, endian: Endian): RawArray {
    const tsize: number = TYPE_SIZE[type];
    const little: boolean = (endian === Endian.little);
    switch (type) {
        case DataType.int8:
            {
                let arr = new Int8Array(count);
                for (let i = 0; i < count; ++i) {
                    arr[i] = view.getInt8(i);
                }
                return arr;
            }

        case DataType.uint8:
            {
                let arr = new Uint8Array(count);
                for (let i = 0; i < count; ++i) {
                    arr[i] = view.getUint8(i);
                }
                return arr;
            }

        case DataType.int16:
            {
                let arr = new Int16Array(count);
                for (let i = 0; i < count; ++i) {
                    arr[i] = view.getInt16(i * tsize, little);
                }
                return arr;
            }

        case DataType.uint16:
            {
                let arr = new Uint16Array(count);
                for (let i = 0; i < count; ++i) {
                    arr[i] = view.getUint16(i * tsize, little);
                }
                return arr;
            }

        case DataType.int32:
            {
                let arr = new Int32Array(count);
                for (let i = 0; i < count; ++i) {
                    arr[i] = view.getInt32(i * tsize, little);
                }
                return arr;
            }

        case DataType.uint32:
            {
                let arr = new Uint32Array(count);
                for (let i = 0; i < count; ++i) {
                    arr[i] = view.getUint32(i * tsize, little);
                }
                return arr;
            }

        case DataType.float32:
            {
                let arr = new Float32Array(count);
                for (let i = 0; i < count; ++i) {
                    arr[i] = view.getFloat32(i * tsize, little);
                }
                return arr;
            }

        case DataType.float64:
            {
                let arr = new Float64Array(count);
                for (let i = 0; i < count; ++i) {
                    arr[i] = view.getFloat64(i * tsize, little);
                }
                return arr;
            }
    }
}

export function memorySize(count: number, type: DataType) {
    return count * TYPE_SIZE[type];
}

export function extractArray(u8arr: Uint8Array, type: DataType, endian: Endian = Endian.little): Float64Array {
    const buf = new ArrayBuffer(u8arr.length);
    const u8view = new DataView(buf);
    for (let i = 0; i < u8arr.length; i++) {
        u8view.setUint8(i, u8arr[i]);
    }
    const count = u8arr.length / TYPE_SIZE[type];
    const tarr = castBuffer(u8view, count, type, endian);
    const result = Float64Array.from(tarr);
    return result;
}