"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Pencil, Save, X, Plus, Loader2, Zap, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface GeneratedCriteria {
  name: string
  description: string
}

interface ScriptSection {
  name: string
  instructions: string
  tips: string
}

interface Script {
  id: string
  name: string
  description: string
  sections: ScriptSection[]
  criteria?: GeneratedCriteria[]
  is_active: boolean
}

interface Rubric {
  id: string
  name: string
  description: string
  is_active: boolean
  system_prompt?: string
  llm_model?: string
}

export default function SettingsPage() {
  const [scripts, setScripts] = useState<Script[]>([])
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [systemPrompt, setSystemPrompt] = useState("")
  const [llmModel, setLlmModel] = useState("openai/gpt-4o-mini")
  const [systemPromptEdited, setSystemPromptEdited] = useState(false)
  const [llmModelEdited, setLlmModelEdited] = useState(false)
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Script | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingScript, setCreatingScript] = useState(false)
  const [newScriptForm, setNewScriptForm] = useState({
    name: "",
    description: "",
    sections: [{ name: "", instructions: "", tips: "" }],
  })

  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const { data: rubricData } = await supabase
      .from("rubrics")
      .select("*")
      .eq("is_active", true)
      .single()

    if (rubricData) {
      setRubric(rubricData)
      setSystemPrompt(rubricData.system_prompt || "")
      setLlmModel(rubricData.llm_model || "openai/gpt-4o-mini")

      const { data: scriptsData } = await supabase
        .from("scripts")
        .select("*")
        .eq("rubric_id", rubricData.id)

      setScripts(scriptsData || [])
    }

    setLoading(false)
  }

  async function generateCriteriaForScript(scriptDescription: string, sections: ScriptSection[]) {
    try {
      const res = await fetch("/api/generate-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptDescription,
          scriptSections: sections,
        }),
      })

      if (!res.ok) throw new Error("Failed to generate criteria")
      const data = await res.json()
      return data.criteria
    } catch (error) {
      console.error("[v0] Error generating criteria:", error)
      return []
    }
  }

  async function handleCreateScript() {
    if (!newScriptForm.name || !newScriptForm.description || !rubric) return

    setCreatingScript(true)
    try {
      // Generate criteria based on script
      const generatedCriteria = await generateCriteriaForScript(
        newScriptForm.description,
        newScriptForm.sections.filter((s) => s.name)
      )

      const { data: scriptData } = await supabase
        .from("scripts")
        .insert({
          rubric_id: rubric.id,
          name: newScriptForm.name,
          description: newScriptForm.description,
          sections: newScriptForm.sections.filter((s) => s.name),
          criteria: generatedCriteria,
          is_active: false,
        })
        .select()

      if (scriptData) {
        setScripts([...scripts, { ...scriptData[0], criteria: generatedCriteria }])
        setNewScriptForm({ name: "", description: "", sections: [{ name: "", instructions: "", tips: "" }] })
      }
    } catch (error) {
      console.error("[v0] Error creating script:", error)
    }
    setCreatingScript(false)
  }

  async function handleUpdateSystemPrompt() {
    if (!rubric) return

    setSaving(true)
    const { error } = await supabase
      .from("rubrics")
      .update({ 
        system_prompt: systemPrompt,
        llm_model: llmModel
      })
      .eq("id", rubric.id)

    if (!error) {
      setSystemPromptEdited(false)
      setLlmModelEdited(false)
    }
    setSaving(false)
  }

  async function handleDeleteScript(scriptId: string) {
    const { error } = await supabase.from("scripts").delete().eq("id", scriptId)

    if (!error) {
      setScripts(scripts.filter((s) => s.id !== scriptId))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-16 lg:pb-0">
      <div>
        <h1 className="text-3xl font-bold">Coaching Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Manage your sales scripts and coaching system
        </p>
      </div>

      {/* System Prompt Section */}
      <Card>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
          <CardDescription>
            Customize the AI coaching instructions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>LLM Model for Analysis</Label>
            <select
              value={llmModel}
              onChange={(e) => {
                setLlmModel(e.target.value)
                setLlmModelEdited(true)
              }}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            >
              <option value="openai/gpt-4o-mini">OpenAI GPT-4o Mini (Fast & Cheap)</option>
              <option value="google/gemini-2.5-flash">Google Gemini 2.5 Flash (Balanced)</option>
              <option value="google/gemini-2.5-pro">Google Gemini 2.5 Pro (Powerful)</option>
            </select>
            <p className="text-xs text-muted-foreground">Choose the AI model to use for analyzing sales calls</p>
          </div>

          <div className="space-y-2">
            <Label>System Prompt</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value)
                setSystemPromptEdited(true)
              }}
              placeholder="Enter the system prompt for AI analysis..."
              className="min-h-32"
            />
            <p className="text-xs text-muted-foreground">Customize the AI coaching instructions</p>
          </div>

          {(systemPromptEdited || llmModelEdited) && (
            <Button onClick={handleUpdateSystemPrompt} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Scripts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Sales Scripts</h2>
          <Button onClick={() => setCreatingScript(!creatingScript)}>
            <Plus className="mr-2 h-4 w-4" />
            New Script
          </Button>
        </div>

        {/* Create New Script Form */}
        {creatingScript && (
          <Card className="border-blue-500">
            <CardHeader>
              <CardTitle>Create New Sales Script</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Script Name</Label>
                <Input
                  value={newScriptForm.name}
                  onChange={(e) =>
                    setNewScriptForm({ ...newScriptForm, name: e.target.value })
                  }
                  placeholder="e.g., Dog Training Consultation"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={newScriptForm.description}
                  onChange={(e) =>
                    setNewScriptForm({ ...newScriptForm, description: e.target.value })
                  }
                  placeholder="Describe the sales process and key objectives..."
                  className="min-h-24"
                />
              </div>

              <div>
                <Label>Script Sections</Label>
                <div className="space-y-3 mt-2">
                  {newScriptForm.sections.map((section, idx) => (
                    <div key={idx} className="p-3 border rounded-lg space-y-2">
                      <Input
                        placeholder="Section name (e.g., Greeting)"
                        value={section.name}
                        onChange={(e) => {
                          const updated = [...newScriptForm.sections]
                          updated[idx].name = e.target.value
                          setNewScriptForm({ ...newScriptForm, sections: updated })
                        }}
                      />
                      <Textarea
                        placeholder="Instructions for this section"
                        value={section.instructions}
                        onChange={(e) => {
                          const updated = [...newScriptForm.sections]
                          updated[idx].instructions = e.target.value
                          setNewScriptForm({ ...newScriptForm, sections: updated })
                        }}
                        className="min-h-20"
                      />
                      <Input
                        placeholder="Tips (optional)"
                        value={section.tips}
                        onChange={(e) => {
                          const updated = [...newScriptForm.sections]
                          updated[idx].tips = e.target.value
                          setNewScriptForm({ ...newScriptForm, sections: updated })
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() =>
                      setNewScriptForm({
                        ...newScriptForm,
                        sections: [
                          ...newScriptForm.sections,
                          { name: "", instructions: "", tips: "" },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Section
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCreateScript} disabled={!newScriptForm.name}>
                  <Zap className="mr-2 h-4 w-4" />
                  Create & Generate Criteria
                </Button>
                <Button variant="outline" onClick={() => setCreatingScript(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scripts List with Accordion */}
        {scripts.length > 0 ? (
          <Accordion type="single" collapsible className="space-y-2">
            {scripts.map((script) => (
              <Card key={script.id}>
                <AccordionItem value={script.id} className="border-0">
                  <AccordionTrigger className="hover:no-underline p-4">
                    <div className="flex items-center gap-3 text-left">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{script.name}</h3>
                        <p className="text-sm text-muted-foreground">{script.description}</p>
                      </div>
                      {script.is_active && <Badge>Active</Badge>}
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="pt-0">
                    <div className="space-y-4 p-4 border-t">
                      {/* Sections */}
                      <div>
                        <h4 className="font-semibold mb-2">Script Sections</h4>
                        <div className="space-y-2">
                          {script.sections.map((section, idx) => (
                            <div key={idx} className="p-3 bg-muted rounded">
                              <p className="font-medium">{section.name}</p>
                              <p className="text-sm text-muted-foreground">{section.instructions}</p>
                              {section.tips && (
                                <p className="text-xs text-blue-500 mt-1">💡 {section.tips}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Generated Criteria */}
                      {script.criteria && script.criteria.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2">Auto-Generated Criteria</h4>
                          <div className="space-y-2">
                            {script.criteria.map((criterion: GeneratedCriteria, idx: number) => (
                              <div key={idx} className="p-3 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
                                <p className="font-medium text-green-900 dark:text-green-100">
                                  {criterion.name}
                                </p>
                                <p className="text-sm text-green-700 dark:text-green-300">
                                  {criterion.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteScript(script.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Script
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Card>
            ))}
          </Accordion>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No scripts created yet. Create your first sales script to get started.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
