const config = require("../server/config.cjs");
const {
  configureTotp,
  disableTotp,
  totpStatus
} = require("../server/auth/totp.cjs");

async function main() {
  const command = process.argv[2];

  if (command === "setup") {
    const setup = await configureTotp({
      account: config.adminUser
    });

    console.log("");
    console.log("ADD THIS ACCOUNT TO YOUR AUTHENTICATOR APP NOW.");
    console.log("The key will not be shown by the status command.");
    console.log("");
    console.log(`Account: ${config.adminUser}`);
    console.log(`Key: ${setup.secret}`);
    console.log(`URI: ${setup.uri}`);
    console.log("");
    console.log("Keep this terminal output private.");
    return;
  }

  if (command === "status") {
    const status = await totpStatus();
    console.log(status.configured ? "Authenticator configured" : "Authenticator not configured");
    return;
  }

  if (command === "disable") {
    await disableTotp();
    console.log("Authenticator disabled");
    return;
  }

  console.log("Usage: node scripts/auth-totp.cjs setup|status|disable");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
