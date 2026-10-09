import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickTaskForm } from "@/components/features/QuickTaskForm";

interface WelcomeCardProps {
  canEdit: boolean;
  /** Creates a task without a project and selects it for the next session. */
  onCreateTask: (title: string) => Promise<unknown>;
  onDismiss: () => void;
}

/** First run: three ways into a first session. */
export function WelcomeCard({ canEdit, onCreateTask, onDismiss }: WelcomeCardProps) {
  return <Card size="sm" className="w-full" aria-labelledby="welcome-title">
    <CardHeader>
      <CardTitle id="welcome-title" className="text-lg">Welcome to Pokus</CardTitle>
      <CardDescription>One calm focus session at a time. Here’s how to start.</CardDescription>
      <CardAction><Button variant="ghost" size="icon-sm" aria-label="Dismiss welcome" onClick={onDismiss}><X /></Button></CardAction>
    </CardHeader>
    <CardContent>
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
        <li><span className="font-medium">Pick a length.</span> <span className="text-muted-foreground">Drag the dial or choose a preset below.</span></li>
        <li><QuickTaskForm label="Add a first task (optional)" disabled={!canEdit} onCreate={onCreateTask} /></li>
        <li><span className="font-medium">Or just start focusing.</span> <span className="text-muted-foreground">A session works without a task, and you can link one while it runs.</span></li>
      </ol>
    </CardContent>
  </Card>;
}
