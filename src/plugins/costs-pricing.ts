export type CostsProvider = 'aws-s3' | 'cloudflare-r2' | 'cloudflare-d1' | 'turso' | 'self-hosted';
export type TursoPlan = 'free' | 'developer' | 'scaler' | 'pro';
export type PricingModel = 'request-based' | 'row-based';

interface RequestPrices {
  put: number;
  copy: number;
  list: number;
  post: number;
  get: number;
  select: number;
  delete: number;
  head: number;
}

interface RowPrices {
  readPerMillion: number;
  writtenPerMillion: number;
}

interface StorageTier {
  limit: number;
  pricePerGB: number;
}

interface DataTransferTier {
  limit: number;
  pricePerGB: number;
}

interface FreeTier {
  storageGB: number;
  classAOps: number;
  classBOps: number;
  rowsRead: number;
  rowsWritten: number;
  permanent: boolean;
}

export interface ProviderPricing {
  provider: CostsProvider;
  pricingModel: PricingModel;
  requests: RequestPrices;
  rows: RowPrices;
  storage: { tiers: StorageTier[] };
  dataTransfer: { tiers: DataTransferTier[]; freeTierGB: number };
  freeTier: FreeTier;
}

const ZERO_REQUESTS: RequestPrices = {
  put: 0, copy: 0, list: 0, post: 0,
  get: 0, select: 0, delete: 0, head: 0
};

const ZERO_ROWS: RowPrices = { readPerMillion: 0, writtenPerMillion: 0 };

const AWS_S3_PRICING: ProviderPricing = {
  provider: 'aws-s3',
  pricingModel: 'request-based',
  requests: {
    put: 0.005 / 1000,
    copy: 0.005 / 1000,
    list: 0.005 / 1000,
    post: 0.005 / 1000,
    get: 0.0004 / 1000,
    select: 0.0004 / 1000,
    delete: 0,
    head: 0.0004 / 1000
  },
  rows: ZERO_ROWS,
  storage: {
    tiers: [
      { limit: 50 * 1024, pricePerGB: 0.023 },
      { limit: 500 * 1024, pricePerGB: 0.022 },
      { limit: 999999999, pricePerGB: 0.021 }
    ]
  },
  dataTransfer: {
    tiers: [
      { limit: 10 * 1024, pricePerGB: 0.09 },
      { limit: 50 * 1024, pricePerGB: 0.085 },
      { limit: 150 * 1024, pricePerGB: 0.07 },
      { limit: 999999999, pricePerGB: 0.05 }
    ],
    freeTierGB: 100
  },
  freeTier: {
    storageGB: 5,
    classAOps: 2_000,
    classBOps: 20_000,
    rowsRead: 0,
    rowsWritten: 0,
    permanent: false
  }
};

const CLOUDFLARE_R2_PRICING: ProviderPricing = {
  provider: 'cloudflare-r2',
  pricingModel: 'request-based',
  requests: {
    put: 4.50 / 1_000_000,
    copy: 4.50 / 1_000_000,
    list: 4.50 / 1_000_000,
    post: 4.50 / 1_000_000,
    get: 0.36 / 1_000_000,
    select: 0.36 / 1_000_000,
    delete: 0,
    head: 0.36 / 1_000_000
  },
  rows: ZERO_ROWS,
  storage: {
    tiers: [
      { limit: 999999999, pricePerGB: 0.015 }
    ]
  },
  dataTransfer: {
    tiers: [],
    freeTierGB: 0
  },
  freeTier: {
    storageGB: 10,
    classAOps: 1_000_000,
    classBOps: 10_000_000,
    rowsRead: 0,
    rowsWritten: 0,
    permanent: true
  }
};

const CLOUDFLARE_D1_PRICING: ProviderPricing = {
  provider: 'cloudflare-d1',
  pricingModel: 'row-based',
  requests: ZERO_REQUESTS,
  rows: {
    readPerMillion: 0.001,
    writtenPerMillion: 1.00
  },
  storage: {
    tiers: [
      { limit: 999999999, pricePerGB: 0.75 }
    ]
  },
  dataTransfer: {
    tiers: [],
    freeTierGB: 0
  },
  freeTier: {
    storageGB: 5,
    classAOps: 0,
    classBOps: 0,
    rowsRead: 25_000_000_000,
    rowsWritten: 50_000_000,
    permanent: true
  }
};

const TURSO_PLANS: Record<TursoPlan, { rows: RowPrices; storagePricePerGB: number; freeTier: FreeTier }> = {
  free: {
    rows: { readPerMillion: 0.001, writtenPerMillion: 1.00 },
    storagePricePerGB: 0.75,
    freeTier: {
      storageGB: 5,
      classAOps: 0,
      classBOps: 0,
      rowsRead: 500_000_000,
      rowsWritten: 10_000_000,
      permanent: true
    }
  },
  developer: {
    rows: { readPerMillion: 0.001, writtenPerMillion: 1.00 },
    storagePricePerGB: 0.75,
    freeTier: {
      storageGB: 9,
      classAOps: 0,
      classBOps: 0,
      rowsRead: 2_500_000_000,
      rowsWritten: 25_000_000,
      permanent: true
    }
  },
  scaler: {
    rows: { readPerMillion: 0.0008, writtenPerMillion: 0.80 },
    storagePricePerGB: 0.50,
    freeTier: {
      storageGB: 24,
      classAOps: 0,
      classBOps: 0,
      rowsRead: 100_000_000_000,
      rowsWritten: 100_000_000,
      permanent: true
    }
  },
  pro: {
    rows: { readPerMillion: 0.00075, writtenPerMillion: 0.75 },
    storagePricePerGB: 0.45,
    freeTier: {
      storageGB: 50,
      classAOps: 0,
      classBOps: 0,
      rowsRead: 250_000_000_000,
      rowsWritten: 250_000_000,
      permanent: true
    }
  }
};

const SELF_HOSTED_PRICING: ProviderPricing = {
  provider: 'self-hosted',
  pricingModel: 'request-based',
  requests: ZERO_REQUESTS,
  rows: ZERO_ROWS,
  storage: {
    tiers: [{ limit: 999999999, pricePerGB: 0 }]
  },
  dataTransfer: {
    tiers: [],
    freeTierGB: 0
  },
  freeTier: {
    storageGB: 0,
    classAOps: 0,
    classBOps: 0,
    rowsRead: 0,
    rowsWritten: 0,
    permanent: true
  }
};

/**
 * Detects the storage provider from a connection string.
 */
export function detectProvider(connectionString: string): CostsProvider {
  if (!connectionString) return 'aws-s3';

  let protocol = '';
  let hostname = '';
  try {
    const url = new URL(connectionString);
    protocol = url.protocol;
    hostname = url.hostname;
  } catch {
    return 'aws-s3';
  }

  if (protocol === 'sqlite+d1:') return 'cloudflare-d1';

  if (protocol === 'sqlite+libsql:') {
    return hostname.endsWith('.turso.io') ? 'turso' : 'self-hosted';
  }

  if (protocol === 'memory:' || protocol === 'file:' || protocol === 'sqlite:') {
    return 'self-hosted';
  }

  if (protocol === 'http:' || protocol === 'https:') {
    if (hostname.endsWith('.r2.cloudflarestorage.com')) return 'cloudflare-r2';
    if (hostname.endsWith('.amazonaws.com')) return 'aws-s3';
    return 'self-hosted';
  }

  if (protocol === 's3:') return 'aws-s3';

  return 'aws-s3';
}

/**
 * Returns the pricing configuration for a given provider.
 */
export function getPricingForProvider(
  provider: CostsProvider,
  options?: { tursoPlan?: TursoPlan }
): ProviderPricing {
  switch (provider) {
    case 'aws-s3':
      return AWS_S3_PRICING;

    case 'cloudflare-r2':
      return CLOUDFLARE_R2_PRICING;

    case 'cloudflare-d1':
      return CLOUDFLARE_D1_PRICING;

    case 'turso': {
      const plan = options?.tursoPlan || 'developer';
      const tursoConfig = TURSO_PLANS[plan] || TURSO_PLANS.developer;
      return {
        provider: 'turso',
        pricingModel: 'row-based',
        requests: ZERO_REQUESTS,
        rows: tursoConfig.rows,
        storage: {
          tiers: [{ limit: 999999999, pricePerGB: tursoConfig.storagePricePerGB }]
        },
        dataTransfer: {
          tiers: [],
          freeTierGB: 0
        },
        freeTier: tursoConfig.freeTier
      };
    }

    case 'self-hosted':
      return SELF_HOSTED_PRICING;

    default:
      return AWS_S3_PRICING;
  }
}
