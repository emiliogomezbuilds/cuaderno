"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPullRequest } from "@/lib/pullRequests";

const MAX_EMAIL_LENGTH = 254;

export type RequestPullState = {
  error?: string;
  success?: boolean;
};

export async function requestPull(
  _prevState: RequestPullState,
  formData: FormData,
): Promise<RequestPullState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "lender") redirect("/login");

  const raw = formData.get("applicant_email");
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { error: "Enter the applicant's email." };
  }
  const applicantEmail = raw.trim().toLowerCase();
  if (applicantEmail.length > MAX_EMAIL_LENGTH || !applicantEmail.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const result = await createPullRequest(supabase, user.id, applicantEmail);
  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath("/lender");
  return { success: true };
}
