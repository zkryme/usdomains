"use client";

import { parseUsdName } from "@usd-names/sdk";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="search"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = parseUsdName(value);
        if (!parsed.ok) {
          setError(parsed.reason);
          return;
        }
        setError("");
        router.push(`/name/${parsed.label}`);
      }}
    >
      <input
        aria-label="Name"
        placeholder="alice.usd"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button className="primary" type="submit">
        Check name
      </button>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
