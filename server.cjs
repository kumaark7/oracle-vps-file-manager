require("./server/index.cjs")
  .startValidatedServer()
  .catch((error) => {
    console.error(`Server configuration error: ${error.message}`);
    process.exitCode = 1;
  });
