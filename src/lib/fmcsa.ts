type FmcsaCarrierResponse = {
  content?: Array<{
    allowToOperate?: "Y" | "N";
    outOfService?: "Y" | "N";
    dotNumber?: number;
    mcNumber?: number;
    legalName?: string;
    dbaName?: string;
    telephone?: string;
    phyStreet?: string;
    phyCity?: string;
    phyState?: string;
    phyZip?: string;
    phyCountry?: string;
  }>;
};

const FMCSA_BASE_URL = "https://mobile.fmcsa.dot.gov/qc/services";

export async function lookupCarrierByDocketNumber(docketNumber: string) {
  const webKey = process.env.FMCSA_WEB_KEY;

  if (!webKey) {
    throw new Error("Missing FMCSA_WEB_KEY environment variable.");
  }

  const url = new URL(
    `${FMCSA_BASE_URL}/carriers/docket-number/${encodeURIComponent(docketNumber)}`
  );
  url.searchParams.set("webKey", webKey);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`FMCSA request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as FmcsaCarrierResponse;
  const carrier = data.content?.[0];

  if (!carrier) {
    return null;
  }

  return {
    legal_name: carrier.legalName ?? null,
    dba_name: carrier.dbaName ?? null,
    dot_number: carrier.dotNumber ?? null,
    mc_number: carrier.mcNumber ?? null,
    allowed_to_operate: toNullableBoolean(carrier.allowToOperate),
    out_of_service: toNullableBoolean(carrier.outOfService),
    phone: carrier.telephone ?? null,
    address: {
      street: carrier.phyStreet ?? null,
      city: carrier.phyCity ?? null,
      state: carrier.phyState ?? null,
      zip: carrier.phyZip ?? null,
      country: carrier.phyCountry ?? null,
    },
  };
}

function toNullableBoolean(value: "Y" | "N" | undefined): boolean | null {
  if (value === "Y") {
    return true;
  }

  if (value === "N") {
    return false;
  }

  return null;
}
