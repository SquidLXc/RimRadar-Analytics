import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nbaRouter from "./nba";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nbaRouter);

export default router;
