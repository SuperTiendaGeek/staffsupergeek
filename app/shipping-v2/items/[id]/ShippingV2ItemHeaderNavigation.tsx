"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

type NavigationEntry = {
  id: string;
  sku: string;
  nombre: string;
};

type ItemNavigation = {
  index: number | null;
  total: number;
  items: NavigationEntry[];
};

const headerNavigationIconClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] text-[#F5F5F5] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F] focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 disabled:cursor-not-allowed disabled:border-[#30312D] disabled:bg-[#151613] disabled:text-[#666862] disabled:opacity-70";

function displayValue(value?: string | null, fallback = "-") {
  const stringValue = String(value ?? "").trim();
  return stringValue || fallback;
}

function itemNavigationLabel(target: NavigationEntry) {
  return displayValue(target.sku || target.nombre || target.id);
}

export function ShippingV2ItemHeaderNavigation({
  currentItemId,
  navigation,
}: {
  currentItemId: string;
  navigation: ItemNavigation;
}) {
  const router = useRouter();
  const itemIndexById = useMemo(() => {
    return new Map(navigation.items.map((item, index) => [item.id, index]));
  }, [navigation.items]);
  const serverIndex = itemIndexById.get(currentItemId) ?? (navigation.index ? navigation.index - 1 : -1);
  const [activeIndex, setActiveIndex] = useState(serverIndex);
  const activeIndexRef = useRef(serverIndex);

  useEffect(() => {
    activeIndexRef.current = serverIndex;
    setActiveIndex(serverIndex);
  }, [serverIndex, currentItemId]);

  if (navigation.items.length === 0 || activeIndex < 0) return null;

  const activeItem = navigation.items[activeIndex];
  if (!activeItem) return null;

  const previousIndex = activeIndex - 1;
  const nextIndex = activeIndex + 1;
  const previous = previousIndex >= 0 ? navigation.items[previousIndex] : null;
  const next = nextIndex < navigation.items.length ? navigation.items[nextIndex] : null;
  const activeLabel = itemNavigationLabel(activeItem);

  function navigate(delta: -1 | 1) {
    const currentIndex = activeIndexRef.current;
    const targetIndex = currentIndex + delta;
    const target = navigation.items[targetIndex];
    if (!target) return;

    activeIndexRef.current = targetIndex;
    setActiveIndex(targetIndex);
    router.push(`/shipping-v2/items/${target.id}`);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-[#30312D] bg-[#151613] p-0.5">
      <button
        type="button"
        aria-label={previous ? `Item anterior: ${itemNavigationLabel(previous)}` : "Item anterior no disponible"}
        title={previous ? `Item anterior: ${itemNavigationLabel(previous)}` : "Item anterior no disponible"}
        className={headerNavigationIconClass}
        disabled={!previous}
        onClick={() => navigate(-1)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        className="inline-block w-[7.25rem] truncate px-1.5 text-center text-xs font-black tabular-nums tracking-normal text-[#D7FF4F] sm:w-[8rem]"
        aria-label={`Item actual: ${activeLabel}`}
        title={`Item actual: ${activeLabel}`}
      >
        {activeLabel}
      </span>
      <button
        type="button"
        aria-label={next ? `Item siguiente: ${itemNavigationLabel(next)}` : "Item siguiente no disponible"}
        title={next ? `Item siguiente: ${itemNavigationLabel(next)}` : "Item siguiente no disponible"}
        className={headerNavigationIconClass}
        disabled={!next}
        onClick={() => navigate(1)}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
