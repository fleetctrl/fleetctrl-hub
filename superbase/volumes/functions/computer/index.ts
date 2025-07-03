// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

interface Computer {
  rustdesk_id: number;
  name: string;
  ip?: string;
  os?: string;
  os_version?: string;
  key: string;
  login_user?: string;
}

async function getComputer(supabaseClient: SupabaseClient, id: string) {
  const { data: computer, error } = await supabaseClient
    .from("computers")
    .select("rustdesk_id")
    .eq("name", id)
    .limit(1);
  if (error) {
    return new Response(JSON.stringify({ error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  return new Response(JSON.stringify({ computer }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function updateComputer(
  supabaseClient: SupabaseClient,
  id: string,
  computer: Computer
) {
  const { error } = await supabaseClient
    .from("computers")
    .update(computer)
    .eq("rustdesk_id", id);
  if (error) {
    return new Response(JSON.stringify({ error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  return new Response(JSON.stringify({ computer }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

async function createComputer(
  supabaseClient: SupabaseClient,
  computer: Computer
) {
  console.log("computer", computer);
  const { error } = await supabaseClient.from("computers").insert(computer);
  console.log("error create", error);
  if (error) {
    return new Response(JSON.stringify({ error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  return new Response(JSON.stringify({ computer }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 201,
  });
}

Deno.serve(async (req) => {
  const { url, method } = req;

  // This is needed if you're planning to invoke your function from a browser.
  if (method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // For more details on URLPattern, check https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API
    const computerPattern = new URLPattern({ pathname: "/computer/:id" });
    const matchingPath = computerPattern.exec(url);
    const id = matchingPath ? matchingPath.pathname.groups.id : null;

    let computer = null;
    if (method === "POST" || method === "PUT") {
      const body = await req.json();
      computer = {
        rustdesk_id: body.rustdesk_id,
        name: body.name,
        key: req.headers.get("key"),
        ip: body?.ip,
        os: body?.os,
        os_version: body?.os_version,
        login_user: body?.login_user,
        last_connection: new Date(),
      };
    }

    // call relevant method based on method and id
    switch (true) {
      case id && method === "GET":
        return getComputer(supabaseClient, id as string);
      case id && method === "PUT":
        return updateComputer(supabaseClient, id as string, computer);
      case method === "POST":
        return createComputer(supabaseClient, computer);
      default:
        return getAllTasks(supabaseClient);
    }
  } catch (error) {
    console.error(error);

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
