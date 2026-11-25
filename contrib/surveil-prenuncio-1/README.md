# SURVEIL contribution

Code supplied by Henrique Godoy and SURVEIL Autonomous ML Swarm in `surveil-prenuncio-1-submission.zip`, dated 23 November 2026. The supplied metadata declares the MIT license. The submission report is in [REPORT.md](../../benchmark/submissions/surveil-prenuncio-1/REPORT.md).

This commit archives the submitted source. The authors did not provide the original training commit. The maintainers independently scored the supplied prediction files. Training has not been independently reproduced.

The two JEV clients now read their service URL from the `JEV_URL` environment variable. This replaces an address specific to the authors' private network. All other source is preserved as submitted. JEV access and its scored feature caches are required to reproduce these inputs. The scripts also expect the authors' `~/prenuncio-swarm` directory layout.
