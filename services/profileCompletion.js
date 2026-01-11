const clampInt = (value, min, max) => {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const hasText = (v, minLen = 1) => typeof v === "string" && v.trim().length >= minLen;

const hasArrayValues = (v) => Array.isArray(v) && v.length > 0;

export const computeProfileCompletion = ({ base, buyer, expert, expertHasResume }) => {
  const role = base?.role;

  if (role === "expert") {
    const summary = expert?.experience_summary;

    const criteria = [
      { filled: hasText(base?.first_name) && hasText(base?.last_name), weight: 10 },
      { filled: hasText(base?.avatar_url), weight: 10 },
      { filled: hasText(expert?.profile_video_url), weight: 10 },
      { filled: hasText(summary, 50), weight: 15 },
      { filled: !!expertHasResume, weight: 15 },
      { filled: hasArrayValues(expert?.domains), weight: 10 },
      { filled: hasArrayValues(expert?.skills), weight: 10 },
      {
        filled:
          Number(expert?.avg_daily_rate) > 0 ||
          Number(expert?.avg_fixed_rate) > 0 ||
          Number(expert?.avg_sprint_rate) > 0,
        weight: 10,
      },
      { filled: Number(expert?.years_experience) > 0, weight: 5 },
      { filled: hasArrayValues(expert?.languages), weight: 5 },
    ];

    const total = criteria.reduce((a, c) => a + c.weight, 0);
    const current = criteria.reduce((a, c) => a + (c.filled ? c.weight : 0), 0);
    return clampInt(total ? (current / total) * 100 : 0, 0, 100);
  }

  if (role === "buyer") {
    const clientType = buyer?.client_type;

    const identityFilled =
      clientType === "individual"
        ? hasText(buyer?.social_proof)
        : clientType === "organisation"
          ? hasText(buyer?.company_name) && (hasText(buyer?.company_website) || hasText(buyer?.website))
          : false;

    const criteria = [
      { filled: hasText(base?.first_name) && hasText(base?.last_name), weight: 30 },
      { filled: hasText(base?.avatar_url), weight: 30 },
      { filled: identityFilled, weight: 40 },
    ];

    const total = criteria.reduce((a, c) => a + c.weight, 0);
    const current = criteria.reduce((a, c) => a + (c.filled ? c.weight : 0), 0);
    return clampInt(total ? (current / total) * 100 : 0, 0, 100);
  }

  return 0;
};
