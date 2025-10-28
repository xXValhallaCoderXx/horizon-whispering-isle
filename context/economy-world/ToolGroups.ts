import * as hz from 'horizon/core'

/**
 * A generic Tool class;
 * 
 * This is a tool class that connects toolName to tool hz.Entity.
 * 
 * Props:
 * @param toolName - The string nameID of the tool.
 * @param toolEntity - hz.Entity corresponding to the tool.
 * 
 */
export class Tool {
    toolName: string
    toolEntity: hz.Entity | undefined

    constructor(toolName: string, toolEntity: hz.Entity | undefined) {
        this.toolName = toolName
        this.toolEntity = toolEntity
    }
}

/**
 * A ToolGroup contains all the possible tools as children in hierarchy.
 * 
 * With one tool group per person ToolGroup acts as a pooling system ands sets initial references between tool names and tool entities.
 */
export class ToolGroups extends hz.Component<typeof ToolGroups> {
    static propsDefinition = {}

    start(): void {

    }
}
hz.Component.register(ToolGroups)

