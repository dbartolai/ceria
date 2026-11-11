import { MathText } from "@/components/math";
import { ActionForm } from "@/lib/tutor/action-form";
import { completeStudyTask } from "@/lib/study-plans/actions";
import type { StudyPlan } from "@/lib/study-plans/contracts";

export function StudyPlanTasks({ plan, canComplete = false }: { plan: StudyPlan; canComplete?: boolean }) {
  const items = [...plan.study_plan_items].sort((a,b) => a.position-b.position);
  return <div className="stack">
    <p className="muted">{items.filter(item => item.completed_at).length} of {items.length} tasks completed</p>
    <ol className="rule-list">{items.map(item => <li className="stack" key={item.id}>
      <div className="row spread flex-wrap"><h3><MathText text={item.title} /></h3><span className="muted">{item.completed_at ? "Completed" : "To do"}</span></div>
      {item.details && <div className="prose-copy"><MathText text={item.details} /></div>}
      {item.source && <p className="muted">Reference: {item.source}</p>}
      <div className="row flex-wrap muted text-sm">{item.estimated_minutes && <span>{item.estimated_minutes} minutes</span>}{item.due_date && <span>Due {item.due_date}</span>}</div>
      {canComplete && <ActionForm action={completeStudyTask} label={item.completed_at ? "Mark incomplete" : "Mark complete"} secondary>
        <input type="hidden" name="id" value={item.id} /><input type="hidden" name="completed" value={String(!item.completed_at)} />
      </ActionForm>}
    </li>)}</ol>
  </div>;
}
