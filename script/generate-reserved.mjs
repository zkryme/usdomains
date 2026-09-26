import fs from "node:fs";

const entries = [];
const seen = new Set();

function add(label, reason) {
  if (seen.has(label)) return;
  seen.add(label);
  entries.push({ label, reason });
}

const brands = [
  ["circle", "Circle brand. Blocks public registration of a label that would impersonate Circle."],
  ["circlepay", "Circle Pay brand. Blocks public registration of a label that would impersonate Circle Pay."],
  ["usdc", "USDC ticker. Blocks a label that would impersonate the stablecoin used for payment on Arc."],
  ["eurc", "EURC ticker. Blocks a label that would impersonate the euro stablecoin."],
  ["arc", "Arc network name. Blocks a label that would impersonate the network this service runs on."],
  ["arcnetwork", "Arc network name. Blocks a concatenated impersonation of the network name."],
  ["coinbase", "Coinbase brand. Blocks a label that would impersonate the exchange."],
  ["opensea", "OpenSea brand. Blocks a label that would impersonate the marketplace."],
  ["binance", "Binance brand. Blocks a label that would impersonate the exchange."],
  ["kraken", "Kraken brand. Blocks a label that would impersonate the exchange."],
  ["paypal", "PayPal brand. Blocks a label that would impersonate the payment company."],
  ["stripe", "Stripe brand. Blocks a label that would impersonate the payment company."],
  ["metamask", "MetaMask brand. Blocks a label that would impersonate the wallet."],
  ["ethereum", "Ethereum network name. Blocks a label that implies that network's authority."],
  ["ens", "ENS brand. This naming service is not ENS and must not present itself as ENS."],
];

const authority = [
  "admin",
  "administrator",
  "support",
  "help",
  "security",
  "official",
  "verified",
  "team",
  "treasury",
  "faucet",
  "bridge",
  "explorer",
  "wallet",
  "registry",
  "registrar",
  "resolver",
];

for (const [label, reason] of brands) add(label, reason);
for (const label of authority) {
  add(label, "Authority or infrastructure role. Blocks a label that implies official control or support.");
}

const comboBrands = [
  "circle",
  "circlepay",
  "usdc",
  "eurc",
  "arc",
  "coinbase",
  "opensea",
  "binance",
  "kraken",
  "paypal",
  "stripe",
  "metamask",
  "ethereum",
  "ens",
];
const comboSuffixes = ["admin", "support", "official"];
const extraBrands = ["circle", "usdc", "arc"];
const extraSuffixes = ["help", "team", "treasury", "wallet", "bridge", "explorer", "faucet", "security", "verified"];

function comboReason(brand, suffix) {
  return `Impersonation combination of ${brand} and ${suffix}. A blocklist cannot catch every variation.`;
}

for (const brand of comboBrands) {
  for (const suffix of comboSuffixes) {
    add(brand + suffix, comboReason(brand, suffix));
    add(`${brand}-${suffix}`, comboReason(brand, suffix));
  }
}
for (const brand of extraBrands) {
  for (const suffix of extraSuffixes) {
    add(brand + suffix, comboReason(brand, suffix));
    add(`${brand}-${suffix}`, comboReason(brand, suffix));
  }
}

const extras = [
  ["circle-pay", "Hyphenated Circle Pay impersonation."],
  ["arc-network", "Hyphenated Arc network impersonation."],
  ["coin-base", "Hyphenated Coinbase impersonation."],
  ["open-sea", "Hyphenated OpenSea impersonation."],
  ["meta-mask", "Hyphenated MetaMask impersonation."],
  ["pay-pal", "Hyphenated PayPal impersonation."],
  ["official-support", "Combined authority claim."],
  ["officialsupport", "Combined authority claim."],
  ["official-team", "Combined authority claim."],
  ["officialteam", "Combined authority claim."],
  ["verified-team", "Combined authority claim."],
  ["verifiedteam", "Combined authority claim."],
  ["security-team", "Combined authority claim."],
  ["securityteam", "Combined authority claim."],
  ["support-team", "Combined authority claim."],
  ["supportteam", "Combined authority claim."],
  ["admin-team", "Combined authority claim."],
  ["adminteam", "Combined authority claim."],
  ["wallet-support", "Combined wallet-support claim."],
  ["walletsupport", "Combined wallet-support claim."],
  ["bridge-official", "Combined bridge-authority claim."],
  ["bridgeofficial", "Combined bridge-authority claim."],
  ["registry-admin", "Combined registry-authority claim."],
  ["registryadmin", "Combined registry-authority claim."],
  ["registrar-admin", "Combined registrar-authority claim."],
  ["registraradmin", "Combined registrar-authority claim."],
  ["resolver-admin", "Combined resolver-authority claim."],
  ["resolveradmin", "Combined resolver-authority claim."],
  ["treasury-admin", "Combined treasury-authority claim."],
  ["treasuryadmin", "Combined treasury-authority claim."],
  ["usd", "The naming suffix itself, reserved so it cannot be registered as a lookalike of this service."],
  ["usdname", "Service identity label."],
  ["usdnames", "Service identity label."],
];

for (const [label, reason] of extras) add(label, reason);

function diagnose(label) {
  if (label.length === 0) return "empty";
  let prev = false;
  for (let i = 0; i < label.length; i++) {
    const c = label[i];
    const hyphen = c === "-";
    const digit = c >= "0" && c <= "9";
    const lower = c >= "a" && c <= "z";
    if (hyphen) {
      if (i === 0 || i + 1 === label.length || prev) return "hyphen";
    } else if (!digit && !lower) return "char";
    prev = hyphen;
  }
  if (label.length > 32) return "long";
  if (label.length < 1) return "short";
  return "ok";
}

for (const entry of entries) {
  const code = diagnose(entry.label);
  if (code !== "ok") throw new Error(`Invalid seed label ${entry.label}: ${code}`);
  if (entry.reason.length < 20) throw new Error(`Reason too short for ${entry.label}`);
}

const document = {
  disclosure:
    "This list cannot catch every spelling, concatenation, translation, or future trademark. v1 accepts only lowercase ASCII labels. Administrators of unregistered labels can add or release reservations later. No administrator can seize a name that is still active or in its grace period.",
  count: entries.length,
  labels: entries.map((entry) => entry.label),
  entries,
};

fs.mkdirSync("script", { recursive: true });
fs.writeFileSync("script/reserved-names.json", `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${entries.length} reservations`);
