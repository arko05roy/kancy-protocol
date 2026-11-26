"use client";

import Link from "next/link";
import { Art, Reveal, Tilt } from "@/components/fx";
import { PixelText } from "@/components/pixel-text";
import { ButtonLink, ChainError, Empty, Loading, PageHead, Split, Star } from "@/components/ui";
import { usd } from "@/lib/format";
import { useVaults } from "@/lib/hooks";

export function VaultList() {
  const { vaults, isError } = useVaults();
  return (
    <div className="page">
      <PageHead title={<PixelText lines={["Vaults"]} />}
        lead="A curator pools deposits and splits them between Managers. Each Manager’s stake absorbs losses before the vault does."
        art={<Art name="column" className="head-art" />}>
        <div className="actions"><ButtonLink href="/curate">Create a vault</ButtonLink></div>
      </PageHead>
      {isError ? <ChainError /> : !vaults ? <Loading /> : vaults.length === 0 ? (
        <Empty title="No vaults yet" art="orbit">
          <p>Nobody has created a vault on this deployment. Create the first one and approve an Active Manager.</p>
          <ButtonLink href="/curate" solid>Create the first vault</ButtonLink>
        </Empty>
      ) : (
        <div className="cards cards-3">
          {vaults.map((v, i) => (
            <Reveal key={v.address} delay={i * 0.06}>
              <Tilt>
                <Link href={`/vaults/${v.address}`} className="vault-card">
                  <header><h2>{v.name || "Unnamed vault"}</h2><Star /></header>
                  <p className="vault-nav">${usd(v.nav)}</p>
                  <p className="muted small">Vault value at last settlement</p>
                  <Split stake={Number(v.idle)} backed={Number(v.allocated)} />
                  <dl>
                    <div><dt>With managers</dt><dd>{usd(v.allocated, 0)}</dd></div>
                    <div><dt>Idle</dt><dd>{usd(v.idle, 0)}</dd></div>
                    <div><dt>Min first-loss</dt><dd>{Number(v.minRatioBps) / 100}%</dd></div>
                    <div><dt>Managers</dt><dd>{v.managers.length}</dd></div>
                  </dl>
                  <span className="role-cta">Open vault <span className="arrow">→</span></span>
                </Link>
              </Tilt>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
