import {
	App,
	Modal,
	Setting,
	TextComponent,
	ButtonComponent,
	Notice,
	moment,
} from "obsidian";
import { t } from "../translations/helper";
import {
	CalendarSpecificConfig,
	KanbanSpecificConfig,
	GanttSpecificConfig,
	TwoColumnSpecificConfig,
	SpecificViewConfig,
	ViewConfig,
	ViewFilterRule,
	ViewMode,
} from "../common/setting-definition";
import TaskProgressBarPlugin from "../index";

export class ViewConfigModal extends Modal {
	private viewConfig: ViewConfig;
	private viewFilterRule: ViewFilterRule;
	private plugin: TaskProgressBarPlugin;
	private isCreate: boolean;
	private onSave: (config: ViewConfig, rules: ViewFilterRule) => void;
	private originalViewConfig: string;
	private originalViewFilterRule: string;
	private hasChanges: boolean = false;

	// References to input components to read values later
	private nameInput: TextComponent;
	private iconInput: TextComponent;
	private textContainsInput: TextComponent;
	private tagsIncludeInput: TextComponent;
	private tagsExcludeInput: TextComponent;
	private statusIncludeInput: TextComponent;
	private statusExcludeInput: TextComponent;
	private projectInput: TextComponent;
	private priorityInput: TextComponent; // Consider dropdown if fixed range
	private dueDateInput: TextComponent;
	private startDateInput: TextComponent;
	private scheduledDateInput: TextComponent;
	private pathIncludesInput: TextComponent;
	private pathExcludesInput: TextComponent;

	// TwoColumnView specific settings
	private taskPropertyKeyInput: TextComponent;
	private leftColumnTitleInput: TextComponent;
	private rightColumnTitleInput: TextComponent;
	private multiSelectTextInput: TextComponent;
	private emptyStateTextInput: TextComponent;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		initialViewConfig: ViewConfig | null, // Null for creating
		initialFilterRule: ViewFilterRule | null, // Null for creating
		onSave: (config: ViewConfig, rules: ViewFilterRule) => void
	) {
		super(app);
		this.plugin = plugin;
		this.isCreate = initialViewConfig === null;

		if (this.isCreate) {
			const newId = `custom_${Date.now()}`;
			this.viewConfig = {
				id: newId,
				name: t("New Custom View"),
				icon: "list-plus",
				type: "custom",
				visible: true,
				hideCompletedAndAbandonedTasks: false,
				filterBlanks: false,
			};
			this.viewFilterRule = initialFilterRule || {}; // Start with empty rules or provided defaults
		} else {
			// Deep copy to avoid modifying original objects until save
			this.viewConfig = JSON.parse(JSON.stringify(initialViewConfig));
			this.viewFilterRule = JSON.parse(
				JSON.stringify(initialFilterRule || {})
			);
		}

		// Store original values for change detection
		this.originalViewConfig = JSON.stringify(this.viewConfig);
		this.originalViewFilterRule = JSON.stringify(this.viewFilterRule);

		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.toggleClass("task-genius-view-config-modal", true);

		this.titleEl.setText(
			this.isCreate
				? t("Create Custom View")
				: t("Edit View: ") + this.viewConfig.name
		);

		// --- Basic View Settings ---
		new Setting(contentEl).setName(t("View Name")).addText((text) => {
			this.nameInput = text;
			text.setValue(this.viewConfig.name).setPlaceholder(
				t("My Custom Task View")
			);
			text.onChange(() => this.checkForChanges());
		});

		new Setting(contentEl)
			.setName(t("Icon Name"))
			.setDesc(
				t(
					"Enter any Lucide icon name (e.g., list-checks, filter, inbox)"
				)
			)
			.addText((text) => {
				this.iconInput = text;
				text.setValue(this.viewConfig.icon).setPlaceholder("list-plus");
				text.onChange(() => this.checkForChanges());
			});

		if (this.viewConfig.id === "calendar") {
			new Setting(contentEl)
				.setName(t("First Day of Week"))
				.setDesc(t("Overrides the locale default for calendar views."))
				.addDropdown((dropdown) => {
					days.forEach((day) => {
						dropdown.addOption(String(day.value), day.name);
					});

					let initialValue = -1; // Default to 'Locale Default'
					if (
						this.viewConfig.specificConfig?.viewType === "calendar"
					) {
						initialValue =
							(
								this.viewConfig
									.specificConfig as CalendarSpecificConfig
							).firstDayOfWeek ?? -1;
					}
					dropdown.setValue(String(initialValue));

					dropdown.onChange((value) => {
						const numValue = parseInt(value);
						const newFirstDayOfWeek =
							numValue === -1 ? undefined : numValue;

						if (
							!this.viewConfig.specificConfig ||
							this.viewConfig.specificConfig.viewType !==
								"calendar"
						) {
							this.viewConfig.specificConfig = {
								viewType: "calendar",
								firstDayOfWeek: newFirstDayOfWeek,
							};
						} else {
							(
								this.viewConfig
									.specificConfig as CalendarSpecificConfig
							).firstDayOfWeek = newFirstDayOfWeek;
						}
						this.checkForChanges();
					});
				});
		} else if (this.viewConfig.id === "kanban") {
			new Setting(contentEl)
				.setName(t("Show checkbox"))
				.setDesc(t("Show a checkbox for each task in the kanban view."))
				.addToggle((toggle) => {
					toggle.setValue(
						(this.viewConfig.specificConfig as KanbanSpecificConfig)
							?.showCheckbox as boolean
					);
					toggle.onChange((value) => {
						if (
							!this.viewConfig.specificConfig ||
							this.viewConfig.specificConfig.viewType !== "kanban"
						) {
							this.viewConfig.specificConfig = {
								viewType: "kanban",
								showCheckbox: value,
							};
						} else {
							(
								this.viewConfig
									.specificConfig as KanbanSpecificConfig
							).showCheckbox = value;
						}
						this.checkForChanges();
					});
				});
		}

		// Two Column View specific config
		if (
			this.isCreate ||
			this.viewConfig.specificConfig?.viewType === "twocolumn"
		) {
			// For new views, add a "View Type" dropdown
			if (this.isCreate) {
				new Setting(contentEl)
					.setName(t("View Type"))
					.setDesc(t("Select the type of view to create"))
					.addDropdown((dropdown) => {
						dropdown
							.addOption("standard", t("Standard View"))
							.addOption("twocolumn", t("Two Column View"))
							.setValue("standard")
							.onChange((value) => {
								if (value === "twocolumn") {
									// Create a new TwoColumnSpecificConfig
									this.viewConfig.specificConfig = {
										viewType: "twocolumn",
										taskPropertyKey: "tags", // Default to tags
										leftColumnTitle: t("Items"),
										rightColumnDefaultTitle: t("Tasks"),
										multiSelectText: t("selected items"),
										emptyStateText: t("No items selected"),
									};
								} else {
									// Remove specificConfig if not needed
									delete this.viewConfig.specificConfig;
								}
								this.checkForChanges();

								// Refresh the modal to show/hide the two column specific settings
								this.onOpen();
							});
					});
			}

			// Only show TwoColumn specific settings if the view type is twocolumn
			if (this.viewConfig.specificConfig?.viewType === "twocolumn") {
				new Setting(contentEl)
					.setName(t("Two Column View Settings"))
					.setHeading();

				// Task Property Key selector
				new Setting(contentEl)
					.setName(t("Group by Task Property"))
					.setDesc(
						t(
							"Select which task property to use for left column grouping"
						)
					)
					.addDropdown((dropdown) => {
						dropdown
							.addOption("tags", t("Tags"))
							.addOption("project", t("Project"))
							.addOption("priority", t("Priority"))
							.addOption("context", t("Context"))
							.addOption("status", t("Status"))
							.addOption("dueDate", t("Due Date"))
							.addOption("scheduledDate", t("Scheduled Date"))
							.addOption("startDate", t("Start Date"))
							.addOption("filePath", t("File Path"))
							.setValue(
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).taskPropertyKey || "tags"
							)
							.onChange((value) => {
								if (
									this.viewConfig.specificConfig?.viewType ===
									"twocolumn"
								) {
									(
										this.viewConfig
											.specificConfig as TwoColumnSpecificConfig
									).taskPropertyKey = value;

									// Set appropriate default titles based on the selected property
									if (!this.leftColumnTitleInput.getValue()) {
										let title = t("Items");
										switch (value) {
											case "tags":
												title = t("Tags");
												break;
											case "project":
												title = t("Projects");
												break;
											case "priority":
												title = t("Priorities");
												break;
											case "context":
												title = t("Contexts");
												break;
											case "status":
												title = t("Status");
												break;
											case "dueDate":
												title = t("Due Dates");
												break;
											case "scheduledDate":
												title = t("Scheduled Dates");
												break;
											case "startDate":
												title = t("Start Dates");
												break;
											case "filePath":
												title = t("Files");
												break;
										}
										this.leftColumnTitleInput.setValue(
											title
										);
										(
											this.viewConfig
												.specificConfig as TwoColumnSpecificConfig
										).leftColumnTitle = title;
									}

									this.checkForChanges();
								}
							});
					});

				// Left Column Title
				new Setting(contentEl)
					.setName(t("Left Column Title"))
					.setDesc(t("Title for the left column (items list)"))
					.addText((text) => {
						this.leftColumnTitleInput = text;
						text.setValue(
							(
								this.viewConfig
									.specificConfig as TwoColumnSpecificConfig
							).leftColumnTitle || t("Items")
						);
						text.onChange((value) => {
							if (
								this.viewConfig.specificConfig?.viewType ===
								"twocolumn"
							) {
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).leftColumnTitle = value;
								this.checkForChanges();
							}
						});
					});

				// Right Column Title
				new Setting(contentEl)
					.setName(t("Right Column Title"))
					.setDesc(
						t("Default title for the right column (tasks list)")
					)
					.addText((text) => {
						this.rightColumnTitleInput = text;
						text.setValue(
							(
								this.viewConfig
									.specificConfig as TwoColumnSpecificConfig
							).rightColumnDefaultTitle || t("Tasks")
						);
						text.onChange((value) => {
							if (
								this.viewConfig.specificConfig?.viewType ===
								"twocolumn"
							) {
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).rightColumnDefaultTitle = value;
								this.checkForChanges();
							}
						});
					});

				// Multi-select Text
				new Setting(contentEl)
					.setName(t("Multi-select Text"))
					.setDesc(t("Text to show when multiple items are selected"))
					.addText((text) => {
						this.multiSelectTextInput = text;
						text.setValue(
							(
								this.viewConfig
									.specificConfig as TwoColumnSpecificConfig
							).multiSelectText || t("selected items")
						);
						text.onChange((value) => {
							if (
								this.viewConfig.specificConfig?.viewType ===
								"twocolumn"
							) {
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).multiSelectText = value;
								this.checkForChanges();
							}
						});
					});

				// Empty State Text
				new Setting(contentEl)
					.setName(t("Empty State Text"))
					.setDesc(t("Text to show when no items are selected"))
					.addText((text) => {
						this.emptyStateTextInput = text;
						text.setValue(
							(
								this.viewConfig
									.specificConfig as TwoColumnSpecificConfig
							).emptyStateText || t("No items selected")
						);
						text.onChange((value) => {
							if (
								this.viewConfig.specificConfig?.viewType ===
								"twocolumn"
							) {
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).emptyStateText = value;
								this.checkForChanges();
							}
						});
					});
			}
		}

		// --- Filter Rules ---
		new Setting(contentEl).setName(t("Filter Rules")).setHeading();

		new Setting(contentEl)
			.setName(t("Hide Completed and Abandoned Tasks"))
			.setDesc(t("Hide completed and abandoned tasks in this view."))
			.addToggle((toggle) => {
				toggle.setValue(this.viewConfig.hideCompletedAndAbandonedTasks);
				toggle.onChange((value) => {
					this.viewConfig.hideCompletedAndAbandonedTasks = value;
					this.checkForChanges();
				});
			});

		new Setting(contentEl)
			.setName(t("Filter Blanks"))
			.setDesc(t("Filter out blank tasks in this view."))
			.addToggle((toggle) => {
				toggle.setValue(this.viewConfig.filterBlanks);
				toggle.onChange((value) => {
					this.viewConfig.filterBlanks = value;
					this.checkForChanges();
				});
			});

		new Setting(contentEl)
			.setName(t("Text Contains"))
			.setDesc(
				t(
					"Filter tasks whose content includes this text (case-insensitive)."
				)
			)
			.addText((text) => {
				this.textContainsInput = text;
				text.setValue(this.viewFilterRule.textContains || "");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Tags Include"))
			.setDesc(t("Task must include ALL these tags (comma-separated)."))
			.addText((text) => {
				this.tagsIncludeInput = text;
				text.setValue(
					(this.viewFilterRule.tagsInclude || []).join(", ")
				).setPlaceholder("#important, #projectA");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Tags Exclude"))
			.setDesc(
				t("Task must NOT include ANY of these tags (comma-separated).")
			)
			.addText((text) => {
				this.tagsExcludeInput = text;
				text.setValue(
					(this.viewFilterRule.tagsExclude || []).join(", ")
				).setPlaceholder("#waiting, #someday");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Project Is"))
			.setDesc(t("Task must belong to this project (exact match)."))
			.addText((text) => {
				this.projectInput = text;
				text.setValue(this.viewFilterRule.project || "");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Priority Is"))
			.setDesc(t("Task must have this priority (e.g., 1, 2, 3)."))
			.addText((text) => {
				this.priorityInput = text;
				text.inputEl.type = "number"; // Set input type to number
				text.setValue(
					this.viewFilterRule.priority !== undefined
						? String(this.viewFilterRule.priority)
						: ""
				);
				text.onChange(() => this.checkForChanges());
			});

		// --- Status Filters (Potentially complex, using simple text for now) ---
		new Setting(contentEl)
			.setName(t("Status Include"))
			.setDesc(
				t(
					"Task status must be one of these (comma-separated markers, e.g., /,>)."
				)
			)
			.addText((text) => {
				this.statusIncludeInput = text;
				text.setValue(
					(this.viewFilterRule.statusInclude || []).join(",")
				).setPlaceholder("/.>");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Status Exclude"))
			.setDesc(
				t(
					"Task status must NOT be one of these (comma-separated markers, e.g., -,x)."
				)
			)
			.addText((text) => {
				this.statusExcludeInput = text;
				text.setValue(
					(this.viewFilterRule.statusExclude || []).join(",")
				).setPlaceholder("-,x");
				text.onChange(() => this.checkForChanges());
			});

		// --- Date Filters ---
		// TODO: Consider using a date picker component or Moment.js for relative dates
		const dateDesc = t(
			"Use YYYY-MM-DD or relative terms like 'today', 'tomorrow', 'next week', 'last month'."
		);
		new Setting(contentEl)
			.setName(t("Due Date Is"))
			.setDesc(dateDesc)
			.addText((text) => {
				this.dueDateInput = text;
				text.setValue(this.viewFilterRule.dueDate || "");
				text.onChange(() => this.checkForChanges());
			});
		new Setting(contentEl)
			.setName(t("Start Date Is"))
			.setDesc(dateDesc)
			.addText((text) => {
				this.startDateInput = text;
				text.setValue(this.viewFilterRule.startDate || "");
				text.onChange(() => this.checkForChanges());
			});
		new Setting(contentEl)
			.setName(t("Scheduled Date Is"))
			.setDesc(dateDesc)
			.addText((text) => {
				this.scheduledDateInput = text;
				text.setValue(this.viewFilterRule.scheduledDate || "");
				text.onChange(() => this.checkForChanges());
			});

		// --- Path Filters ---
		new Setting(contentEl)
			.setName(t("Path Includes"))
			.setDesc(t("Task must contain this path (case-insensitive)."))
			.addText((text) => {
				this.pathIncludesInput = text;
				text.setValue(this.viewFilterRule.pathIncludes || "");
				text.onChange(() => this.checkForChanges());
			});
		new Setting(contentEl)
			.setName(t("Path Excludes"))
			.setDesc(t("Task must NOT contain this path (case-insensitive)."))
			.addText((text) => {
				this.pathExcludesInput = text;
				text.setValue(this.viewFilterRule.pathExcludes || "");
				text.onChange(() => this.checkForChanges());
			});

		// --- First Day of Week ---
		const days = [
			{ value: -1, name: t("Locale Default") }, // Use -1 or undefined as sentinel
			{ value: 0, name: moment.weekdays(true)[0] }, // Monday
			{ value: 1, name: moment.weekdays(true)[1] }, // Tuesday
			{ value: 2, name: moment.weekdays(true)[2] }, // Wednesday
			{ value: 3, name: moment.weekdays(true)[3] }, // Thursday
			{ value: 4, name: moment.weekdays(true)[4] }, // Friday
			{ value: 5, name: moment.weekdays(true)[5] }, // Saturday
			{ value: 6, name: moment.weekdays(true)[6] }, // Sunday
		];

		// --- Action Buttons ---
		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText(t("Save"))
					.setCta()
					.onClick(() => {
						this.saveChanges();
					});
			})
			.addButton((button) => {
				button.setButtonText(t("Cancel")).onClick(() => {
					this.close();
				});
			});
	}

	private parseStringToArray(input: string): string[] {
		if (!input || input.trim() === "") return [];
		return input
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s !== "");
	}

	private checkForChanges() {
		const currentConfig = JSON.stringify(this.viewConfig);
		const currentFilterRule = JSON.stringify(this.getCurrentFilterRule());
		this.hasChanges =
			currentConfig !== this.originalViewConfig ||
			currentFilterRule !== this.originalViewFilterRule;
	}

	private getCurrentFilterRule(): ViewFilterRule {
		const rules: ViewFilterRule = {};
		const textContains = this.textContainsInput?.getValue()?.trim();
		if (textContains) rules.textContains = textContains;

		const tagsInclude = this.parseStringToArray(
			this.tagsIncludeInput?.getValue() || ""
		);
		if (tagsInclude.length > 0) rules.tagsInclude = tagsInclude;

		const tagsExclude = this.parseStringToArray(
			this.tagsExcludeInput?.getValue() || ""
		);
		if (tagsExclude.length > 0) rules.tagsExclude = tagsExclude;

		const statusInclude = this.parseStringToArray(
			this.statusIncludeInput?.getValue() || ""
		);
		if (statusInclude.length > 0) rules.statusInclude = statusInclude;

		const statusExclude = this.parseStringToArray(
			this.statusExcludeInput?.getValue() || ""
		);
		if (statusExclude.length > 0) rules.statusExclude = statusExclude;

		const project = this.projectInput?.getValue()?.trim();
		if (project) rules.project = project;

		const priorityStr = this.priorityInput?.getValue()?.trim();
		if (priorityStr) {
			const priorityNum = parseInt(priorityStr, 10);
			if (!isNaN(priorityNum)) {
				rules.priority = priorityNum;
			}
		}

		const dueDate = this.dueDateInput?.getValue()?.trim();
		if (dueDate) rules.dueDate = dueDate;

		const startDate = this.startDateInput?.getValue()?.trim();
		if (startDate) rules.startDate = startDate;

		const scheduledDate = this.scheduledDateInput?.getValue()?.trim();
		if (scheduledDate) rules.scheduledDate = scheduledDate;

		const pathIncludes = this.pathIncludesInput?.getValue()?.trim();
		if (pathIncludes) rules.pathIncludes = pathIncludes;

		const pathExcludes = this.pathExcludesInput?.getValue()?.trim();
		if (pathExcludes) rules.pathExcludes = pathExcludes;

		return rules;
	}

	private saveChanges() {
		// Update viewConfig
		this.viewConfig.name =
			this.nameInput.getValue().trim() || t("Unnamed View");
		this.viewConfig.icon = this.iconInput.getValue().trim() || "list";

		// Update viewFilterRule
		this.viewFilterRule = this.getCurrentFilterRule();

		// Reset change tracking state
		this.originalViewConfig = JSON.stringify(this.viewConfig);
		this.originalViewFilterRule = JSON.stringify(this.viewFilterRule);
		this.hasChanges = false;

		// Call the onSave callback
		this.onSave(this.viewConfig, this.viewFilterRule);
		this.close();
		new Notice(t("View configuration saved."));
	}

	onClose() {
		if (this.hasChanges) {
			const confirmed = confirm(
				t("You have unsaved changes. Save before closing?")
			);
			if (confirmed) {
				this.saveChanges();
				return;
			}
		}

		const { contentEl } = this;
		contentEl.empty();
	}
}
