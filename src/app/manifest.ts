import type { MetadataRoute } from "next";

export default function manifest():MetadataRoute.Manifest{return{
  name:"GameDay Softball",
  short_name:"GameDay",
  description:"Live softball scorekeeping, team management, and game video.",
  start_url:"/dashboard",
  display:"standalone",
  background_color:"#041e42",
  theme_color:"#041e42",
  icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any"}]
}}
