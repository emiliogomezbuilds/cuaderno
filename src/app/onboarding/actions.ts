"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function chooseRole(formData: FormData) {
  const role = formData.get("role");
  if (role !== "applicant" && role !== "lender") {
    throw new Error("Invalid role");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .insert({ id: user.id, role, email: user.email });
  if (error) throw new Error(error.message);

  redirect(`/${role}`);
}
