import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import workspaceRouter from "./workspace.js";
import projectsRouter from "./projects.js";
import filesRouter from "./files.js";
import agentRouter from "./agent.js";
import agentContinuationRouter from "./agentContinuation.js";
import settingsRouter from "./settings.js";
import checkpointRouter from "./checkpoint.js";
import runtimeRouter from "./runtime.js";
import providerDiagnosticsRouter from "./providerDiagnostics.js";
import providerRegistryRouter from "./providerRegistry.js";
import taskBoardRouter from "./taskBoard.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workspaceRouter);
router.use(projectsRouter);
router.use(filesRouter);
router.use(agentRouter);
router.use(agentContinuationRouter);
router.use(settingsRouter);
router.use(checkpointRouter);
router.use(runtimeRouter);
router.use(providerDiagnosticsRouter);
router.use(providerRegistryRouter);
router.use(taskBoardRouter);

export default router;
