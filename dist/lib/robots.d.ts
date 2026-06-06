export type RobotsResult = {
    status: "unavailable";
    robotsUrl: string;
} | {
    status: "ok";
    robotsUrl: string;
    allowed: boolean;
    rule: string | null;
};
export declare function checkRobotsTxt(targetUrl: string, { timeoutMs }?: {
    timeoutMs?: number;
}): Promise<RobotsResult>;
