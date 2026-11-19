/* Minimal Chrome Extension Manifest V3 declarations (zero external @types dependency). */

declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      id?: string;
      tab?: { id?: number; url?: string };
      url?: string;
    }

    const lastError: { message?: string } | undefined;

    function sendMessage<TReq = unknown, TRes = unknown>(message: TReq): Promise<TRes>;

    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };

    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };

    const onStartup: {
      addListener(callback: () => void): void;
    };

    function getManifest(): { version: string; name: string };
  }

  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }

    interface StorageChange {
      oldValue?: unknown;
      newValue?: unknown;
    }

    const local: StorageArea;
    const session: StorageArea | undefined;

    const onChanged: {
      addListener(
        callback: (changes: Record<string, StorageChange>, areaName: string) => void,
      ): void;
    };
  }

  namespace action {
    function setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void>;
    function setTitle(details: { title: string; tabId?: number }): Promise<void>;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      active?: boolean;
    }

    function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function sendMessage<TReq = unknown, TRes = unknown>(tabId: number, message: TReq): Promise<TRes>;
  }

  namespace permissions {
    function contains(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
    function request(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
  }

  namespace declarativeNetRequest {
    interface ModifyHeaderInfo {
      header: string;
      operation: "append" | "set" | "remove";
      value?: string;
    }

    interface Rule {
      id: number;
      priority?: number;
      action: {
        type: "modifyHeaders" | "block" | "allow" | "redirect";
        requestHeaders?: ModifyHeaderInfo[];
      };
      condition: {
        urlFilter?: string;
        resourceTypes?: Array<
          | "main_frame"
          | "sub_frame"
          | "stylesheet"
          | "script"
          | "image"
          | "font"
          | "object"
          | "xmlhttprequest"
          | "ping"
          | "csp_report"
          | "media"
          | "websocket"
          | "webtransport"
          | "webbundle"
          | "other"
        >;
      };
    }

    function updateDynamicRules(options: {
      addRules?: Rule[];
      removeRuleIds?: number[];
    }): Promise<void>;
  }
}
