import type { SocialPlatform } from "@prisma/client";

export type OAuthConnectInput = {
  workspaceId: string;
  redirectUri?: string;
};

export type OAuthCallbackInput = {
  code?: string;
  accountName?: string;
  externalUserId?: string;
};

export type PublishInput = {
  publicationId: string;
  content: string;
  scheduledAt?: Date | null;
};

export type SocialAdapterResult = {
  ok: boolean;
  externalUrl?: string;
  externalId?: string;
  message: string;
};

export interface SocialPlatformAdapter {
  platform: SocialPlatform;
  getConnectUrl(input: OAuthConnectInput): string;
  exchangeCallback(input: OAuthCallbackInput): Promise<SocialAdapterResult>;
  publish(input: PublishInput): Promise<SocialAdapterResult>;
  syncStatus(publicationId: string): Promise<SocialAdapterResult>;
}

abstract class BaseSocialAdapter implements SocialPlatformAdapter {
  abstract platform: SocialPlatform;

  getConnectUrl(input: OAuthConnectInput) {
    const configured = process.env[`${this.platform}_CLIENT_ID`];
    const redirect = encodeURIComponent(input.redirectUri ?? "");
    if (!configured) {
      return `personaos://connect/${this.platform.toLowerCase()}?workspace=${input.workspaceId}&mode=manual`;
    }
    return `https://auth.personaos.local/${this.platform.toLowerCase()}?workspace=${input.workspaceId}&redirect_uri=${redirect}`;
  }

  async exchangeCallback(input: OAuthCallbackInput): Promise<SocialAdapterResult> {
    if (!input.code && !input.externalUserId) {
      return {
        ok: false,
        message: `${this.platform} OAuth credentials are not configured yet.`
      };
    }

    return {
      ok: true,
      externalId: input.externalUserId ?? `manual-${this.platform.toLowerCase()}`,
      message: `${this.platform} connection saved in manual/OAuth-ready mode.`
    };
  }

  async publish(): Promise<SocialAdapterResult> {
    return {
      ok: false,
      message: `${this.platform} API publishing is not enabled. Add platform credentials to activate real publishing.`
    };
  }

  async syncStatus(publicationId: string): Promise<SocialAdapterResult> {
    return {
      ok: true,
      externalId: publicationId,
      message: `${this.platform} status sync queued. Real platform sync requires credentials.`
    };
  }
}

class TelegramAdapter extends BaseSocialAdapter {
  platform = "TELEGRAM" as const;
}

class InstagramAdapter extends BaseSocialAdapter {
  platform = "INSTAGRAM" as const;
}

class ThreadsAdapter extends BaseSocialAdapter {
  platform = "THREADS" as const;
}

class VkAdapter extends BaseSocialAdapter {
  platform = "VK" as const;
}

export function getSocialAdapter(platform: SocialPlatform): SocialPlatformAdapter {
  const adapters: Record<SocialPlatform, SocialPlatformAdapter> = {
    TELEGRAM: new TelegramAdapter(),
    INSTAGRAM: new InstagramAdapter(),
    THREADS: new ThreadsAdapter(),
    VK: new VkAdapter()
  };
  return adapters[platform];
}
