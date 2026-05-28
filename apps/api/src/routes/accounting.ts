/**
 * Regnskap-integrasjon — Tripletex / Fiken direkte API.
 *
 * STATUS: Stub. Bygges når Sakspilot har partner-status hos hver leverandør.
 *
 * Steg 1: Søk partner-status (Helene gjør dette manuelt — se docs/tripletex-fiken-soknad.md)
 * Steg 2: Implementer OAuth-flow
 * Steg 3: Implementer mapping fra Sakspilot-modell til Tripletex/Fiken-skjema
 * Steg 4: Test mot deres test-miljø
 * Steg 5: Aktiver i prod
 *
 * Frem til da: brukerne bruker CSV-eksport (/reports/month.csv) som funker
 * fint mot import-funksjonen i begge systemer.
 */
import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const NOT_IMPLEMENTED = {
  error: "Ikke implementert ennå",
  status: "stub",
  reason:
    "Direkte API-integrasjon krever partner-status hos Tripletex/Fiken (3-5 dagers godkjenning). " +
    "Bruk /reports/month.csv for å hente fakturagrunnlag som du selv importerer.",
  csvAlternative: "/reports/month.csv?year=YYYY&month=MM",
};

// ── Tripletex ───────────────────────────────────────────────────

router.get("/tripletex/status", (_req: Request, res: Response) => {
  return res.json({
    connected: false,
    implementationStatus: "stub",
    blocker: "Avventer partner-status hos Tripletex",
    csvAlternative: "/reports/month.csv",
  });
});

router.post("/tripletex/oauth/start", (_req: Request, res: Response) => {
  return res.status(501).json(NOT_IMPLEMENTED);
});

router.post("/tripletex/push-timesheet", (_req: Request, res: Response) => {
  return res.status(501).json(NOT_IMPLEMENTED);
});

// ── Fiken ───────────────────────────────────────────────────────

router.get("/fiken/status", (_req: Request, res: Response) => {
  return res.json({
    connected: false,
    implementationStatus: "stub",
    blocker: "Avventer partner-status hos Fiken",
    csvAlternative: "/reports/month.csv",
  });
});

router.post("/fiken/oauth/start", (_req: Request, res: Response) => {
  return res.status(501).json(NOT_IMPLEMENTED);
});

router.post("/fiken/create-invoice", (_req: Request, res: Response) => {
  return res.status(501).json(NOT_IMPLEMENTED);
});

export default router;
