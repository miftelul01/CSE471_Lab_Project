"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Card, ErrorNote, Field, SuccessNote, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import {
  DAY_LABELS,
  DIETARY_TAGS,
  DIETARY_TAG_LABELS,
  MAX_MEAL_TEXT_LENGTH,
  MAX_TEMPLATE_NAME_LENGTH,
  NUTRITION_PROFILES,
  NUTRITION_PROFILE_LABELS,
} from "@/lib/menu";
import type { DietaryTag, NutritionProfile } from "@prisma/client";

type Template = {
  id: string;
  name: string;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
  estimatedCostPerHead: number | null;
  nutritionProfile: NutritionProfile | null;
  dietaryTags: DietaryTag[];
};

export function ProposeMenuForm() {
  const router = useRouter();
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [breakfast, setBreakfast] = useState("");
  const [lunch, setLunch] = useState("");
  const [dinner, setDinner] = useState("");
  const [estimatedCostPerHead, setEstimatedCostPerHead] = useState("");
  const [nutritionProfile, setNutritionProfile] = useState<NutritionProfile | "">("");
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    fetch("/api/menu-proposals/templates")
      .then((res) => res.json())
      .then((body) => setTemplates(body.templates ?? []))
      .catch(() => {});
  }, []);

  function toggleTag(tag: DietaryTag) {
    setDietaryTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function applyTemplate(templateId: string) {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setBreakfast(t.breakfast ?? "");
    setLunch(t.lunch ?? "");
    setDinner(t.dinner ?? "");
    setEstimatedCostPerHead(t.estimatedCostPerHead != null ? String(t.estimatedCostPerHead) : "");
    setNutritionProfile(t.nutritionProfile ?? "");
    setDietaryTags(t.dietaryTags);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (![breakfast, lunch, dinner].some((v) => v.trim())) {
      setError("Fill in at least one of breakfast, lunch, or dinner.");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/menu-proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayOfWeek,
        breakfast: breakfast.trim() || undefined,
        lunch: lunch.trim() || undefined,
        dinner: dinner.trim() || undefined,
        estimatedCostPerHead: estimatedCostPerHead.trim() || undefined,
        nutritionProfile: nutritionProfile || undefined,
        dietaryTags,
      }),
    });
    const body = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(body.error ?? "Could not submit the candidate");
      return;
    }
    router.push("/menu");
    router.refresh();
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    setTemplateMessage(null);
    const res = await fetch("/api/menu-proposals/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: templateName.trim(),
        breakfast: breakfast.trim() || undefined,
        lunch: lunch.trim() || undefined,
        dinner: dinner.trim() || undefined,
        estimatedCostPerHead: estimatedCostPerHead.trim() || undefined,
        nutritionProfile: nutritionProfile || undefined,
        dietaryTags,
      }),
    });
    const body = await res.json();
    setSavingTemplate(false);
    if (!res.ok) {
      setTemplateMessage(body.error ?? "Could not save the template");
      return;
    }
    setTemplates((prev) => [body, ...prev]);
    setTemplateName("");
    setTemplateMessage("Saved.");
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Day" hint="Your candidate competes in that day's independent ranked-choice vote.">
            <select
              className={inputClass}
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
            >
              {DAY_LABELS.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estimated cost per head" hint="Optional — used for the cost tie-break tier.">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={estimatedCostPerHead}
              onChange={(e) => setEstimatedCostPerHead(e.target.value)}
              placeholder="e.g. 120"
            />
          </Field>
        </div>

        {templates.length > 0 ? (
          <Field label="Start from a template" hint="Pre-fills the fields below — you can still edit them.">
            <select className={inputClass} defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="" disabled>
                Choose a saved template…
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Breakfast">
            <input
              className={inputClass}
              value={breakfast}
              onChange={(e) => setBreakfast(e.target.value)}
              maxLength={MAX_MEAL_TEXT_LENGTH}
              placeholder="—"
            />
          </Field>
          <Field label="Lunch">
            <input
              className={inputClass}
              value={lunch}
              onChange={(e) => setLunch(e.target.value)}
              maxLength={MAX_MEAL_TEXT_LENGTH}
              placeholder="—"
            />
          </Field>
          <Field label="Dinner">
            <input
              className={inputClass}
              value={dinner}
              onChange={(e) => setDinner(e.target.value)}
              maxLength={MAX_MEAL_TEXT_LENGTH}
              placeholder="—"
            />
          </Field>
        </div>

        <Field label="Nutrition profile" hint="Optional, self-declared.">
          <select
            className={inputClass}
            value={nutritionProfile}
            onChange={(e) => setNutritionProfile(e.target.value as NutritionProfile | "")}
          >
            <option value="">Not specified</option>
            {NUTRITION_PROFILES.map((p) => (
              <option key={p} value={p}>
                {NUTRITION_PROFILE_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Dietary tags" hint="What this candidate is compatible with — hides it from a resident whose declared restriction isn't checked here.">
          <div className="flex flex-wrap gap-2">
            {DIETARY_TAGS.map((tag) => (
              <label
                key={tag}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                  dietaryTags.includes(tag)
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={dietaryTags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                />
                {DIETARY_TAG_LABELS[tag]}
              </label>
            ))}
          </div>
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? "Submitting…" : "Submit candidate"}
          </button>
        </div>
      </form>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Save the fields above as a reusable template
        </p>
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name"
            maxLength={MAX_TEMPLATE_NAME_LENGTH}
          />
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={savingTemplate || !templateName.trim()}
            onClick={handleSaveTemplate}
          >
            Save template
          </button>
        </div>
        {templateMessage ? <SuccessNote>{templateMessage}</SuccessNote> : null}
      </div>
    </Card>
  );
}
