import assert from "node:assert/strict";
import {
  LABEL_BAD_CHAR,
  LABEL_BAD_HYPHEN,
  LABEL_EMPTY,
  LABEL_OK,
  LABEL_TOO_LONG,
  LABEL_TOO_SHORT,
  diagnoseLabel,
  parseUsdName,
} from "./parse";

assert.equal(diagnoseLabel(""), LABEL_EMPTY);
assert.equal(diagnoseLabel("A"), LABEL_BAD_CHAR);
assert.equal(diagnoseLabel("Ab"), LABEL_BAD_CHAR);
assert.equal(diagnoseLabel("Abc"), LABEL_BAD_CHAR);
assert.equal(diagnoseLabel("ab"), LABEL_TOO_SHORT);
assert.equal(diagnoseLabel("-ab"), LABEL_BAD_HYPHEN);
assert.equal(diagnoseLabel("ab-"), LABEL_BAD_HYPHEN);
assert.equal(diagnoseLabel("a--b"), LABEL_BAD_HYPHEN);
assert.equal(diagnoseLabel("a".repeat(33)), LABEL_TOO_LONG);
assert.equal(diagnoseLabel("abc"), LABEL_OK);
assert.equal(diagnoseLabel("a-b"), LABEL_OK);
assert.equal(diagnoseLabel("a-b-c"), LABEL_OK);
assert.equal(diagnoseLabel("ab_c"), LABEL_BAD_CHAR);
assert.equal(diagnoseLabel("abc😀"), LABEL_BAD_CHAR);
assert.equal(diagnoseLabel("Abc"), LABEL_BAD_CHAR);

const alice = parseUsdName("Alice.USD");
assert.equal(alice.ok, true);
if (alice.ok) assert.equal(alice.name, "alice.usd");

const subdomain = parseUsdName("a.b.usd");
assert.equal(subdomain.ok, false);
if (!subdomain.ok) assert.equal(subdomain.status, "unsupported");

const eth = parseUsdName("alice.eth");
assert.equal(eth.ok, false);

console.log("parse tests passed");
