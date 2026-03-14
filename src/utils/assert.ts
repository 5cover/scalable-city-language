const invariant: (condition: boolean, message: string) => asserts condition = (
  condition: boolean,
  message: string
): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

export { invariant };
