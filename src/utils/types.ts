export type DeepPartial<T> = T extends readonly unknown[]
    ? T
    : T extends object
      ? { [P in keyof T]+?: DeepPartial<T[P]> | undefined }
      : T;
