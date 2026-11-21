"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { httpClient, type HttpError } from "@/utils/httpClient";
import {
  fetchHolidayEvents,
  pickSeasonTheme,
  type CartHolidayFields,
  type HolidayEvent,
  type HolidayTheme,
} from "@/lib/holidayApi";

const INTENT_KEY = "landars_holiday_intent";
const SNOW_OFF_KEY = "landars_season_snow_off";

/**
 * Development-only preview: open any page with ?season=christmas or
 * ?season=new_year to see the decorations while no holiday is switched on in
 * the admin. Compiled out of production builds (NODE_ENV is inlined).
 */
function devPreviewEvents(): HolidayEvent[] | null {
  if (process.env.NODE_ENV === "production") return null;
  const asked =
    new URLSearchParams(window.location.search).get("season") ??
    window.sessionStorage.getItem("landars_season_preview");
  if (asked !== "christmas" && asked !== "new_year") return null;
  window.sessionStorage.setItem("landars_season_preview", asked);
  const christmas = asked === "christmas";
  return [
    {
      id: -1,
      name: christmas ? "Christmas" : "New Year",
      theme: asked,
      emoji: christmas ? "🎄" : "🎆",
      label: christmas ? "Christmas" : "New Year",
      surcharge_percent: "15",
      delivery_window_label: christmas
        ? "Delivered 22–24 December"
        : "Delivered 29–31 December",
    },
  ];
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage — decoration prefs are optional */
  }
}

export type OccasionResult =
  | { ok: true; cart: CartHolidayFields }
  | { ok: false; error: string };

interface SeasonContextValue {
  /** Holidays open for ordering right now. */
  events: HolidayEvent[];
  /** Site decoration theme (null = regular look). */
  theme: HolidayTheme | null;
  /** Holiday the signed-in customer's basket is set to (null = regular). */
  cartOccasion: HolidayEvent | null;
  /** True when the basket ships by post (holiday orders unavailable). */
  cartIsPost: boolean;
  /** Push fresh cart data into the context (pages that fetch /api/cart/ call this). */
  syncFromCart: (cart: CartHolidayFields | null | undefined) => void;
  /** Set or clear the basket's occasion on the server. */
  setOccasion: (eventId: number | null) => Promise<OccasionResult>;
  /** Guests: remember a holiday choice to apply once they sign in. */
  rememberIntent: (eventId: number) => void;
  snowEnabled: boolean;
  setSnowEnabled: (on: boolean) => void;
}

const SeasonContext = createContext<SeasonContextValue | null>(null);

function errorMessage(error: unknown): string {
  const data = (error as HttpError)?.response?.data;
  if (data && typeof data === "object" && "error" in data) {
    return String((data as { error: unknown }).error);
  }
  return "Could not update your basket. Please try again.";
}

export function SeasonProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { cart } = useCart();
  const [events, setEvents] = useState<HolidayEvent[]>([]);
  const [cartOccasion, setCartOccasion] = useState<HolidayEvent | null>(null);
  const [cartIsPost, setCartIsPost] = useState(false);
  const [snowEnabled, setSnowEnabledState] = useState(true);
  const intentAppliedRef = useRef(false);

  const theme = useMemo(() => pickSeasonTheme(events), [events]);

  useEffect(() => {
    let cancelled = false;
    let preview: HolidayEvent[] | null = null;
    try {
      preview = devPreviewEvents();
    } catch {
      /* storage blocked — preview is optional */
    }
    if (preview) setEvents(preview);
    else
      void fetchHolidayEvents().then((list) => {
        if (!cancelled) setEvents(list);
      });
    setSnowEnabledState(readStorage(SNOW_OFF_KEY) !== "1");
    return () => {
      cancelled = true;
    };
  }, []);

  // Scope every seasonal style to <html data-season="…">.
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.season = theme;
    else delete root.dataset.season;
    return () => {
      delete root.dataset.season;
    };
  }, [theme]);

  const syncFromCart = useCallback(
    (cart: CartHolidayFields | null | undefined) => {
      if (!cart) return;
      setCartOccasion(cart.holiday_event ?? null);
      setCartIsPost(cart.is_home_delivery === false);
    },
    []
  );

  const setOccasion = useCallback(
    async (eventId: number | null): Promise<OccasionResult> => {
      try {
        const cart = await httpClient.put<CartHolidayFields>("/api/cart/", {
          holiday_event: eventId,
        });
        syncFromCart(cart);
        return { ok: true, cart };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },
    [syncFromCart]
  );

  const rememberIntent = useCallback((eventId: number) => {
    writeStorage(INTENT_KEY, String(eventId));
  }, []);

  // Signed-in: read the basket's occasion once, then apply a guest's saved intent.
  useEffect(() => {
    if (!user) {
      setCartOccasion(null);
      setCartIsPost(false);
      intentAppliedRef.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      let cart: CartHolidayFields | null = null;
      try {
        cart = await httpClient.get<CartHolidayFields>("/api/cart/");
      } catch {
        return;
      }
      if (cancelled) return;
      syncFromCart(cart);

      const intent = readStorage(INTENT_KEY);
      if (!intent || intentAppliedRef.current) return;
      intentAppliedRef.current = true;
      writeStorage(INTENT_KEY, null);
      const id = Number(intent);
      if (Number.isFinite(id) && cart?.is_home_delivery !== false) {
        await setOccasion(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, syncFromCart, setOccasion]);

  // Basket lines changed: the server may have dropped the occasion (parcel-only
  // basket), so re-read it while a holiday is selected.
  const cartLinesKey = useMemo(
    () =>
      cart
        .map((item) => `${item.productId}:${item.quantity}`)
        .sort()
        .join(","),
    [cart]
  );
  const occasionSetRef = useRef(false);
  occasionSetRef.current = cartOccasion !== null;
  useEffect(() => {
    if (!user || !occasionSetRef.current) return;
    const timeoutId = setTimeout(() => {
      void httpClient
        .get<CartHolidayFields>("/api/cart/")
        .then(syncFromCart)
        .catch(() => {});
    }, 900);
    return () => clearTimeout(timeoutId);
  }, [cartLinesKey, user, syncFromCart]);

  const setSnowEnabled = useCallback((on: boolean) => {
    setSnowEnabledState(on);
    writeStorage(SNOW_OFF_KEY, on ? null : "1");
  }, []);

  const value = useMemo<SeasonContextValue>(
    () => ({
      events,
      theme,
      cartOccasion,
      cartIsPost,
      syncFromCart,
      setOccasion,
      rememberIntent,
      snowEnabled,
      setSnowEnabled,
    }),
    [
      events,
      theme,
      cartOccasion,
      cartIsPost,
      syncFromCart,
      setOccasion,
      rememberIntent,
      snowEnabled,
      setSnowEnabled,
    ]
  );

  return (
    <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>
  );
}

const FALLBACK: SeasonContextValue = {
  events: [],
  theme: null,
  cartOccasion: null,
  cartIsPost: false,
  syncFromCart: () => {},
  setOccasion: async () => ({ ok: false, error: "Unavailable" }),
  rememberIntent: () => {},
  snowEnabled: false,
  setSnowEnabled: () => {},
};

/** Safe outside the provider (tests, isolated renders): behaves as "no season". */
export function useSeason(): SeasonContextValue {
  return useContext(SeasonContext) ?? FALLBACK;
}
