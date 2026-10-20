import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nbaRouter from "./nba";
import discordRouter from "./discord";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nbaRouter);
router.use(discordRouter);

export default router;
