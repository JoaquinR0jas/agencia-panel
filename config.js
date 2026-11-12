// Configuración pública del panel.
// La anon key está diseñada para vivir en el navegador: todas las tablas tienen
// RLS y solo un usuario con perfil activo puede leer o escribir.
window.PANEL_CONFIG = {
  SUPABASE_URL: "https://zeoftiimvtppnakozlky.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inplb2Z0aWltdnRwcG5ha296bGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0Mjg0MzgsImV4cCI6MjExMDAwNDQzOH0.i7SwABzrvZ4foOLRCqKM-z1hcpWSRxy-F2N4aFiOytA",
  PROJECT_REF: "zeoftiimvtppnakozlky",
  // Centro de control local: `npm run orquestador` en el repo de captación.
  ORQUESTADOR_URL: "http://127.0.0.1:8787",
  REPO_URL: "https://github.com/JoaquinR0jas/agencia-panel"
};
