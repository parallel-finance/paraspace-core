.PHONY: ci
ci:
	yarn compile
	yarn size
	yarn lint
