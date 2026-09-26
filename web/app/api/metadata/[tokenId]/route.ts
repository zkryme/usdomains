import { createPublicClient, http } from "viem";
import { nameAbi, registrarAbi } from "@usd-names/sdk";
import { arcTestnet } from "@/lib/chains";
import { testnetDeployment } from "@/lib/deployment";

export async function GET(_request: Request, context: { params: Promise<{ tokenId: string }> }) {
  const { tokenId: raw } = await context.params;
  if (!testnetDeployment.deployed || !testnetDeployment.name || !testnetDeployment.registrar) {
    return Response.json(
      {
        error: "Contracts are not deployed. Metadata is not a source of ownership or expiry.",
        authoritative: "USDRegistrar and USDName",
      },
      { status: 404 },
    );
  }

  let tokenId: bigint;
  try {
    tokenId = BigInt(raw);
  } catch {
    return Response.json({ error: "Invalid token id" }, { status: 400 });
  }

  const client = createPublicClient({ chain: arcTestnet, transport: http(arcTestnet.rpcUrls.default.http[0]) });
  try {
    const [uri, label, owner, phase, expiry] = await Promise.all([
      client.readContract({ address: testnetDeployment.name, abi: nameAbi, functionName: "tokenURI", args: [tokenId] }),
      client.readContract({ address: testnetDeployment.name, abi: nameAbi, functionName: "labelOf", args: [tokenId] }),
      client.readContract({ address: testnetDeployment.name, abi: nameAbi, functionName: "ownerOf", args: [tokenId] }),
      client.readContract({ address: testnetDeployment.registrar, abi: registrarAbi, functionName: "phase", args: [tokenId] }),
      client.readContract({ address: testnetDeployment.registrar, abi: registrarAbi, functionName: "expiryOf", args: [tokenId] }),
    ]);
    return Response.json({
      authoritative: "USDRegistrar and USDName. This response is a copy and can be stale after expiry or re-registration.",
      tokenId: tokenId.toString(),
      label,
      owner,
      phase: Number(phase),
      expiry: expiry.toString(),
      tokenURI: uri,
    });
  } catch {
    return Response.json(
      { error: "This token does not exist or has been burned.", authoritative: "USDRegistrar and USDName" },
      { status: 404 },
    );
  }
}
