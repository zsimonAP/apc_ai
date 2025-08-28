import { Router } from "express";
import { createCsvDownload } from "../services/downloads.js";

const router = Router();
router.post("/download", createCsvDownload);
export default router;
