"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Sbota } from "@/types";
import {
  getMapData,
  mapFallback,
  groupByArea,
  type MapData,
  type MapBlock,
} from "@/lib/fields";
import { Sticker } from "@/components/Sticker";
import { useT } from "@/components/CopyProvider";

/**
 * خريطة القاهرة.
 *
 * ⚠ **اتعملت من أول وجديد (٢٠٢٦-٠٩-١٥)** بعد ما المالك قال «مش عجباني»،
 *    والفحص طلّع إنها مش مسألة ذوق بس:
 *
 *    ١) **كانت فاضية على الإنتاج.** الربط بين السبوطة والكتلة كان مطابقة نص
 *       حرفية مع `match_labels`. ولما بقى المالك يكتب المنطقة بإيده، «العبور»
 *       ما لاقتش كتلة فاختفت — وكذلك أي سبوطة من غير منطقة. التلاتة المفتوحين
 *       كلهم كانوا مش بيبانوا. الحل في `blockKeyFor` (src/lib/fields.ts):
 *       مفيش طريق بيرجّع «مش لاقي» — آخر محطة كتلة «مناطق تانية».
 *    ٢) **٧ كتل عايمة بفراغ كبير** ما كانتش بتقرا كقاهرة. دلوقتي ١٠ كتل
 *       متلاصقة على ضفتي النيل، والنيل شكل مش شريط.
 *    ٣) **المفتاح تحت كان بيوصف نقط اتشالت من زمان**، والعنوان بيقول «دوس
 *       على أي نقطة» ومفيش نقط.
 *    ٤) **الغامضة كانت دايرة عايمة في اللاحاجة.** بقت كتلة في مكانها على
 *       الخريطة — «منطقة مش هتعرفها غير لما تحجز».
 *
 * واللي بيدي الخريطة لازمة دلوقتي تلات حاجات مش موجودة قبل كده:
 *    · العدّاد فوق: «خدت ٣ مناطق من ١٠» — الخريطة بقت حاجة بتتجمّع.
 *    · ختم على كل منطقة رحتها.
 *    · «انت هنا» على منطقتك انت.
 */

/** مساحة الرسم */
const VB = { w: 400, h: 404 };

/** النيل — شكل منحني بيفصل غرب عن شرق، مش شريط مايل */
const NILE =
  "M168 0 C 160 70, 150 120, 146 175 C 142 240, 150 300, 162 360 L 162 404 L 186 404 " +
  "C 176 330, 168 260, 172 190 C 176 120, 186 60, 192 0 Z";

export function CairoMap({
  sbotat,
  className = "",
}: {
  sbotat: Sbota[];
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  // فلتر «شغل» — أماكن الشغل (cafe_work / coworking)
  const [workOnly, setWorkOnly] = useState(false);
  const [map, setMap] = useState<MapData>(mapFallback);

  useEffect(() => {
    let alive = true;
    getMapData().then((d) => {
      if (alive) setMap(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const [openArea, setOpenArea] = useState<string | null>(null);

  const shown = workOnly ? sbotat.filter((s) => s.kind === "work") : sbotat;
  const picked = shown.find((s) => s.slug === open);
  const groups = useMemo(
    () => groupByArea(map.blocks, shown),
    [map.blocks, shown],
  );
  const busy = useMemo(
    () => new Map(groups.map((g) => [g.block.key, g.slugs])),
    [groups],
  );
  const areaList = openArea ? (busy.get(openArea) ?? []) : [];
  const allWork = (slugs: string[]) =>
    slugs.length > 0 &&
    slugs.every((sl) => shown.find((s) => s.slug === sl)?.kind === "work");

  /** الكتل اللي جوّه الرسم، والشرايط اللي تحته (بره القاهرة + مناطق تانية) */
  const drawn = map.blocks.filter((b) => !b.far && b.w > 0 && b.h > 0);
  const strips = map.blocks.filter((b) => b.far || b.w === 0 || b.h === 0);

  /** العدّاد — الكتل المرسومة بس، «مناطق تانية» مش منطقة تتجمّع */
  const collectable = drawn.length;
  const taken = map.visitedBlocks.filter((k) =>
    drawn.some((b) => b.key === k),
  ).length;

  /**
   * «مناطق تانية» كتلة مطابقة مش مكان — بتبان بس لما يكون فيها سبوطة فعلًا،
   * وإلا بتبقى كبسولة فاضية معناها صفر.
   */
  const visibleStrips = strips.filter(
    (b) => b.far || (busy.get(b.key)?.length ?? 0) > 0,
  );

  function tapArea(key: string) {
    const slugs = busy.get(key) ?? [];
    if (slugs.length === 0) return;
    setOpenArea(null);
    if (slugs.length === 1) {
      setOpen(open === slugs[0] ? null : slugs[0]);
      return;
    }
    setOpen(null);
    setOpenArea(openArea === key ? null : key);
  }

  /** كتلة واحدة جوّه الرسم */
  function Block({ a }: { a: MapBlock }) {
    const slugs = busy.get(a.key) ?? [];
    const hot = slugs.length > 0;
    const been = map.visitedBlocks.includes(a.key);
    const here = map.myBlock === a.key;
    // التسمية والعدد لازم يفضلوا جوّه الكتلة مهما كان `ly` في القاعدة
    const labelY = hot
      ? Math.min(Math.max(a.ly, a.y + 26), a.y + a.h - 24)
      : a.ly;

    return (
      <g
        role={hot ? "button" : undefined}
        tabIndex={hot ? 0 : undefined}
        aria-label={hot ? `${a.label} — ${slugs.length}` : a.label}
        style={hot ? { cursor: "pointer" } : undefined}
        onClick={hot ? () => tapArea(a.key) : undefined}
        onKeyDown={
          hot
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") tapArea(a.key);
              }
            : undefined
        }
      >
        <rect
          x={a.x}
          y={a.y}
          width={a.w}
          height={a.h}
          rx={a.r}
          fill={hot ? "#3A2B24" : been ? "#2E333D" : "#262A32"}
          stroke={hot ? "#F4632A" : been ? "#6B7080" : "#333845"}
          strokeWidth={hot ? 2.5 : 2}
        />

        <text
          x={a.lx}
          y={labelY}
          textAnchor="middle"
          fill={hot ? "#FBF7EF" : been ? "#D8DAE0" : "#9EA2AB"}
          style={{
            font: `${hot ? 800 : 600} 15px var(--font-plex), sans-serif`,
          }}
        >
          {a.label}
        </text>

        {hot && (
          <text
            x={a.lx}
            y={labelY + 20}
            textAnchor="middle"
            fill="#F4632A"
            style={{ font: "900 14px var(--font-rubik), sans-serif" }}
          >
            {slugs.length === 1
              ? t("map.area.one")
              : t("map.area.many", { n: slugs.length })}
          </text>
        )}

        {/* ختم المنطقة اللي خدتها */}
        {been && (
          <g
            transform={`translate(${a.x + a.w - 22} ${a.y + 16})`}
            aria-hidden="true"
          >
            <circle cx="0" cy="0" r="10" fill="#F4632A" />
            <path
              d="M-4.5 0 l3 3.2 l6 -6.4"
              stroke="#14161A"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {/* منطقتك انت */}
        {here && (
          <text
            x={a.lx}
            y={a.y + a.h - 10}
            textAnchor="middle"
            fill="#2B4CFF"
            style={{ font: "900 11px var(--font-rubik), sans-serif" }}
          >
            {t("map.here")}
          </text>
        )}

        {/* كل سبوطاتها شغل — لابتوب صغير في الركن */}
        {hot && allWork(slugs) && (
          <g
            transform={`translate(${a.x + 12} ${a.y + 10})`}
            aria-hidden="true"
          >
            <rect x="0" y="0" width="18" height="16" rx="4" fill="#F4632A" />
            <rect
              x="4"
              y="3"
              width="10"
              height="7"
              rx="1.5"
              fill="none"
              stroke="#14161A"
              strokeWidth="1.6"
            />
            <path
              d="M2.5 12.5h13"
              stroke="#14161A"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    );
  }

  return (
    <div className={className}>
      {/* العدّاد — الخريطة بقت حاجة بتتجمّع.
          للزائر اللي لسه مش داخل بحسابه مفيش «خدت» ولا «مخدتش» — مفيش سجل. */}
      {map.signedIn && (
        <div className="mb-2 font-display text-15 font-black">
          {taken === 0
            ? t("map.progress.zero")
            : t("map.progress", { n: taken, all: collectable })}
        </div>
      )}

      <div
        className="relative w-full overflow-hidden rounded-20"
        style={{ background: "#191C22", border: "2px solid #333845" }}
      >
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          className="block h-auto w-full"
          role="img"
          aria-label={t("shared.label.5")}
        >
          <path d={NILE} fill="#2B3A52" />

          {drawn.map((a) => (
            <Block key={a.key} a={a} />
          ))}

          {/* الغامضة — كتلة في مكانها، مش دايرة عايمة في الفراغ */}
          <g
            role="button"
            tabIndex={0}
            aria-label={t("shared.label.4")}
            style={{ cursor: "pointer" }}
            onClick={() => setOpen(open === "mystery" ? null : "mystery")}
          >
            <rect
              x="8"
              y="330"
              width="128"
              height="66"
              rx="24"
              fill="#2B4CFF"
            />
            <text
              x="72"
              y="360"
              textAnchor="middle"
              fill="#FBF7EF"
              style={{ font: "900 26px var(--font-rubik), sans-serif" }}
            >
              {t("shared.text.5")}
            </text>
            <text
              x="72"
              y="382"
              textAnchor="middle"
              fill="#FBF7EF"
              style={{ font: "800 13px var(--font-plex), sans-serif" }}
            >
              {t("shared.text.3")}
            </text>
          </g>
        </svg>

        {/* منطقة فيها كذا سبوطة */}
        {openArea && areaList.length > 1 && (
          <div
            className="absolute inset-x-3 bottom-3 rounded-16 p-4"
            style={{ background: "#EFE3CF", color: "#14161A" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="font-display text-18 font-black">
                {t("map.area.pick")}
              </div>
              <button
                type="button"
                onClick={() => setOpenArea(null)}
                aria-label={t("shared.label.2")}
                className="min-h-[44px] shrink-0 cursor-pointer border-0 bg-transparent font-display text-20 font-black"
              >
                ×
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {areaList.map((sl) => {
                const s2 = shown.find((x) => x.slug === sl);
                if (!s2) return null;
                return (
                  <button
                    key={sl}
                    type="button"
                    onClick={() => {
                      setOpenArea(null);
                      setOpen(sl);
                    }}
                    className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-14 px-3 text-start"
                    style={{
                      background: "#E2D2B4",
                      border: "2px solid #14161A",
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-display text-16 font-black">
                        {s2.name}
                      </span>
                      <span className="block truncate font-body text-13">
                        {s2.meta}
                      </span>
                    </span>
                    <span className="shrink-0 font-body text-13 font-semibold">
                      {s2.left}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* بطاقة السبوطة */}
        {picked && (
          <div
            className="absolute inset-x-3 bottom-3 rounded-16 p-4"
            style={{ background: "#EFE3CF", color: "#14161A" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-20 font-black">
                  {picked.name}
                </div>
                <div className="font-body text-14">{picked.meta}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label={t("shared.label.2")}
                className="min-h-[44px] shrink-0 cursor-pointer border-0 bg-transparent font-display text-20 font-black"
              >
                ×
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <Sticker
                color={picked.full ? "ink" : "orange"}
                rotate={-3}
                size="sm"
              >
                {picked.left}
              </Sticker>
              <Link
                href={
                  picked.kind === "work"
                    ? `/shoghl/${picked.slug}`
                    : `/s/${picked.slug}`
                }
                className="grid min-h-[44px] place-items-center rounded-14 px-5 font-display text-16 font-black"
                style={{ background: "#F4632A", color: "#14161A" }}
              >
                {t("shared.text.1")}
              </Link>
            </div>
          </div>
        )}

        {open === "mystery" && !picked && (
          <div
            className="absolute inset-x-3 bottom-3 rounded-16 p-4"
            style={{ background: "#2B4CFF", color: "#FBF7EF" }}
          >
            <div className="font-display text-20 font-black">
              {t("shared.text.3")}
            </div>
            <div className="mt-1 font-body text-14">{t("shared.text.2")}</div>
            <Link
              href="/s/mystery"
              className="mt-3 grid min-h-[44px] w-full place-items-center rounded-14 font-display text-16 font-black"
              style={{ background: "#FBF7EF", color: "#14161A" }}
            >
              {t("shared.text.1")}
            </Link>
          </div>
        )}
      </div>

      {/* الشريط تحت الخريطة: فلتر «شغل» + بره القاهرة + مناطق تانية.
          · «شغل» كان كبسولة **فوق** الخريطة وقاعد على كتلة زايد وأكتوبر.
          · الفيوم والسخنة مش حتت في القاهرة — حطهم كتل جوه الإطار كان
            بيكدب على الشكل.
          · «مناطق تانية» بتظهر بس لما يكون فيها سبوطة فعلًا. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setWorkOnly((v) => !v);
            setOpen(null);
          }}
          aria-pressed={workOnly}
          className="min-h-[36px] cursor-pointer rounded-pill px-3 font-display text-13 font-black"
          style={{
            border: `2px solid ${workOnly ? "#F4632A" : "var(--line)"}`,
            background: workOnly ? "#F4632A" : "transparent",
            color: workOnly ? "#14161A" : "var(--fg)",
          }}
        >
          {t("shoghl.map.filter")}
        </button>

        {visibleStrips.length > 0 && (
          <span
            className="ms-2 font-body text-13"
            style={{ color: "var(--muted)" }}
          >
            {t("map.far.title")}
          </span>
        )}
        {visibleStrips.map((b) => {
          const slugs = busy.get(b.key) ?? [];
          const hot = slugs.length > 0;
          const been = map.visitedBlocks.includes(b.key);
          return (
            <button
              key={b.key}
              type="button"
              disabled={!hot}
              onClick={() => tapArea(b.key)}
              className="min-h-[36px] cursor-pointer rounded-pill px-3 font-display text-13 font-black disabled:cursor-default"
              style={{
                background: hot ? "#F4632A" : "transparent",
                color: hot ? "#14161A" : "var(--muted)",
                border: `2px solid ${hot ? "#F4632A" : "var(--line)"}`,
              }}
            >
              {been && "✓ "}
              {b.label}
              {b.note ? ` · ${b.note}` : ""}
              {hot ? ` · ${slugs.length}` : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
