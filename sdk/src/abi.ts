import { parseAbi } from "viem";

export const registrarAbi = parseAbi([
  "function inspect(string label) view returns (uint8 availability, uint8 labelCode, bool reserved, address owner, uint64 expiry, uint64 graceEnds, uint256 annualPrice, bool registrationPaused)",
  "function quote(string label, uint8 years_) view returns (uint256)",
  "function feeExempt() view returns (address)",
  "function treasury() view returns (address)",
  "function accountedBalance() view returns (uint256)",
  "function TREASURY_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function withdraw(uint256 amount)",
  "function annualPrice(uint256 length) view returns (uint256)",
  "function commitmentHash(string label, address recipient, uint8 years_, address payer, bytes32 secret) view returns (bytes32)",
  "function commitments(bytes32 commitment) view returns (uint64)",
  "function commit(bytes32 commitment)",
  "function reveal(string label, address recipient, uint8 years_, bytes32 secret)",
  "function renew(string label, uint8 years_)",
  "function diagnoseLabel(string label) view returns (uint8)",
  "function priceSchedule(uint8 tier) view returns (uint256 current, uint256 pending, uint64 eta)",
  "function graceSchedule() view returns (uint64 current, uint64 pending, uint64 eta)",
  "function registrationPaused() view returns (bool)",
  "function isActive(uint256 tokenId) view returns (bool)",
  "function phase(uint256 tokenId) view returns (uint8)",
  "function expiryOf(uint256 tokenId) view returns (uint64)",
  "function resolverContract() view returns (address)",
  "function MIN_COMMITMENT_AGE() view returns (uint256)",
  "function MAX_COMMITMENT_AGE() view returns (uint256)",
  "function MIN_YEARS() view returns (uint8)",
  "function MAX_YEARS() view returns (uint8)",
  "function USDC_UNIT() view returns (uint256)",
  "function MIN_PRICE_DELAY() view returns (uint64)",
  "function MIN_GRACE_DELAY() view returns (uint64)",
  "error RegistrationPaused()",
  "error LabelReserved()",
  "error NameUnavailable()",
  "error CommitmentNotFound()",
  "error CommitmentTooNew()",
  "error CommitmentExpired()",
]);

export const nameAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function labelOf(uint256 tokenId) view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function balanceOf(address owner) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const resolverAbi = parseAbi([
  "function addr(uint256 tokenId) view returns (address)",
  "function addrIfActive(string label) view returns (address)",
  "function text(uint256 tokenId, string key) view returns (string)",
  "function textIfActive(string label, string key) view returns (string)",
  "function setAddress(string label, address paymentAddress)",
  "function setText(string label, string key, string value)",
]);

export const reverseAbi = parseAbi([
  "function setPrimary(string label)",
  "function clearPrimary()",
  "function reverse(address wallet) view returns (string label, bool verified)",
  "function primarySetting(address wallet) view returns (uint256 tokenId, bool set)",
]);

export const usdcAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
