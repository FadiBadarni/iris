// One real violation (bg-[#fa8072] should be bg-brand-salmon) and one
// allowlisted class (bg-[url(/hero.jpg)]). The CLI should report exactly
// one issue.
export const Hero = () => <div className="bg-[#fa8072] bg-[url(/hero.jpg)]" />;
