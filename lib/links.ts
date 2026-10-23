// Outbound deep links for a provider or place. The demo data has no stored website URLs,
// so these resolve through search/maps providers using the business name and location.

const enc = encodeURIComponent

export function providerLinks(name: string, city?: string, state?: string) {
  const loc = [city, state].filter(Boolean).join(", ")
  return [
    { label: "Website", href: `https://www.google.com/search?q=${enc(`${name} ${loc}`)}` },
    { label: "Maps", href: `https://www.google.com/maps/search/?api=1&query=${enc(`${name} ${loc}`)}` },
    { label: "Yelp", href: `https://www.yelp.com/search?find_desc=${enc(name)}&find_loc=${enc(loc)}` },
    { label: "BBB", href: `https://www.bbb.org/search?find_text=${enc(name)}&find_loc=${enc(loc)}` },
  ]
}

export function zipMapLink(zip: string) {
  return `https://www.google.com/maps/search/?api=1&query=${enc(zip)}`
}
