import { formatAnalyticsDuration as duration, type buildPrAnalytics } from "../domain/prAnalytics";
type Report = ReturnType<typeof buildPrAnalytics>;
interface Props {
  first: string;
  second: string;
  left: Report;
  right: Report;
}
export function PrAnalyticsComparison({ first, second, left, right }: Props) {
  const count = (report: Report, value: number) =>
    !report.coverage.some((c) => c.coversRange) ? "—" : `${report.complete ? "" : "≥ "}${value}`;
  const time = (report: Report, key: "merge" | "response" | "review") => (
    <>
      {duration(report[key].median)}
      <small>
        p75 {duration(report[key].p75)} · {report[key].n} PRs{report[key].n < 5 ? " · small sample" : ""}
      </small>
    </>
  );
  return (
    <section className="pa-comparison" aria-label="Repository comparison">
      <div className="pa-panel-heading">
        <div>
          <h2>Repository comparison</h2>
          <p>Same period and author filter · counts reflect volume, not productivity</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>{first}</th>
            <th>{second}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Coverage</th>
            {[left, right].map((r, i) => (
              <td key={i}>
                {r.complete
                  ? "Complete"
                  : r.coverage.some((c) => c.coversRange)
                    ? "Partial · minimum counts"
                    : "Not loaded · Refresh"}
                {!r.complete && r.coverage.flatMap((c) => c.result?.warnings ?? []).length > 0 && (
                  <small>{r.coverage.flatMap((c) => c.result?.warnings ?? []).join(" ")}</small>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th>Created</th>
            <td>{count(left, left.created)}</td>
            <td>{count(right, right.created)}</td>
          </tr>
          <tr>
            <th>Merged</th>
            <td>{count(left, left.merged)}</td>
            <td>{count(right, right.merged)}</td>
          </tr>
          <tr>
            <th>Comments</th>
            <td>{count(left, left.comments)}</td>
            <td>{count(right, right.comments)}</td>
          </tr>
          <tr>
            <th>Median time to merge</th>
            <td>{time(left, "merge")}</td>
            <td>{time(right, "merge")}</td>
          </tr>
          <tr>
            <th>Median first response</th>
            <td>{time(left, "response")}</td>
            <td>{time(right, "response")}</td>
          </tr>
          <tr>
            <th>Median review → merge</th>
            <td>{time(left, "review")}</td>
            <td>{time(right, "review")}</td>
          </tr>
        </tbody>
      </table>
      <p className="pa-timing-note">
        Calendar time includes weekends and rework. Different task sizes and workflows can explain
        differences; this is not a ranking.
      </p>
    </section>
  );
}
