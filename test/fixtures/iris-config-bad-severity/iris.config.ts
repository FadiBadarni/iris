// "warning" instead of "warn" — typical user typo. The loader should
// throw a clear diagnostic at load time, not silently no-op at lint time.
export default {
  rules: {
    "iris/no-reinventing-shadcn": "warning",
  },
};
