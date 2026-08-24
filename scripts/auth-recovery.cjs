const {
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
  remainingRecoveryCodes
} = require("../server/auth/recovery.cjs");

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const command = process.argv[2];

  if (command === "generate") {
    const codes = await generateRecoveryCodes();

    console.log("");
    console.log("SAVE THESE RECOVERY CODES NOW.");
    console.log("They will not be shown again.");
    console.log("");

    for (const code of codes) {
      console.log(code);
    }

    console.log("");
    console.log("Store them outside this VPS.");
    return;
  }

  if (command === "count") {
    console.log(
      await remainingRecoveryCodes()
    );
    return;
  }

  if (command === "verify") {
    const accepted = await verifyAndConsumeRecoveryCode(
      await readStdin()
    );

    console.log(
      accepted
        ? "Recovery code accepted"
        : "Invalid recovery code"
    );

    if (!accepted) {
      process.exitCode = 1;
    }

    return;
  }

  console.log(
    "Usage: node scripts/auth-recovery.cjs generate|verify|count"
  );

  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
