import { short } from "./format";

/** The two protocol-run demo Managers (bots/README.md). */
const KNOWN: Record<string, string> = {
  "0x9688cb16b6ed1d4b34a3ef83e4c44796fe0d70d8": "Demo: centered",
  "0x50d6b008e5698ea9a76f5f9c3f17b56637d9c426": "Demo: bad",
};

export function managerName(address: string, metadataURI?: string) {
  const known = KNOWN[address.toLowerCase()];
  if (known) return known;
  const meta = metadataURI?.trim();
  // metadata is free text set by the Manager; only use short plain labels as a name
  if (meta && meta.length <= 32 && !meta.includes("://") && !meta.startsWith("kancy-manager-bot:")) return meta;
  return short(address);
}
