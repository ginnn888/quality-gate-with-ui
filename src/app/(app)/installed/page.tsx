import { redirect } from "next/navigation";

// The installed-repos list lives at "/". Keep this path working for old links.
export default function InstalledIndex() {
  redirect("/");
}
