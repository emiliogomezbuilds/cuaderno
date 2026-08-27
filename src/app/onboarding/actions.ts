"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MAX_DISPLAY_NAME_LENGTH = 80;

export async function chooseRole(formData: FormData) {
  const role = formData.get("role");
  if (role !== "applicant" && role !== "lender") {
    throw new Error("Invalid role");
  }

  const rawDisplayName = formData.get("display_name");
  let displayName: string | null = null;
  if (role === "lender" && typeof rawDisplayName === "string") {
    const trimmed = rawDisplayName.trim();
    if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new Error(`Institution name is too long (max ${MAX_DISPLAY_NAME_LENGTH} characters).`);
    }
    displayName = trimmed.length > 0 ? trimmed : null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .insert({ id: user.id, role, email: user.email, display_name: displayName });
  if (error) throw new Error(error.message);

  redirect(`/${role}`);
}
