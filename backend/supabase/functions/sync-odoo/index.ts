// backend/supabase/functions/sync-odoo/index.ts

const ODOO_URL = Deno.env.get("ODOO_URL");
const ODOO_DB = Deno.env.get("ODOO_DB");
const ODOO_USER_ID = Deno.env.get("ODOO_USER_ID") || "2";
const ODOO_API_KEY = Deno.env.get("ODOO_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json();

    // SI AÚN NO TIENES ODOO: Simula la respuesta
    if (!ODOO_API_KEY || !ODOO_URL) {
      console.log("Modo Simulación: Odoo no configurado. Registrando evento en logs.");
      return new Response(
        JSON.stringify({
          success: true,
          mocked: true,
          message: "Sincronización simulada (Odoo no configurado aún)"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        }
      );
    }

    // SI YA TIENES ODOO: Código real
    if (action === "sync_asset") {
      const response = await fetch(`${ODOO_URL}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "object",
            method: "execute_kw",
            args: [
              ODOO_DB,
              parseInt(ODOO_USER_ID),
              ODOO_API_KEY,
              "stock.lot",
              "create",
              [{ name: payload.codigo_qr, product_id: payload.odoo_product_id }]
            ]
          },
          id: Date.now()
        })
      });

      const result = await response.json();

      return new Response(JSON.stringify({ success: true, odooResult: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    return new Response(JSON.stringify({ error: "Acción no soportada" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});